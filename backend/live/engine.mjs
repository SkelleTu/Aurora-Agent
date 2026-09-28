import { randomUUID } from 'node:crypto';

const LIVE_SYSTEM_PROMPT = `You are Aurora, the live voice agent of Aura System. Speak naturally in Brazilian Portuguese unless the user speaks another language. Keep responses concise and conversational. You are operating inside a persistent full-duplex voice session. Never claim an Aura action succeeded unless its tool result confirms it.`;

export const LIVE_AURA_TOOL = {
  type: 'function',
  function: {
    name: 'aura_action',
    description: 'Execute an authorized Aura System operation.',
    parameters: {
      type: 'object',
      properties: {
        domain: { type: 'string', enum: ['avatar','scene','memory','voice','animation','clothing','media','project','game','automation','settings','integration','interface','system'] },
        action: { type: 'string' },
        args: { type: 'object', additionalProperties: true },
      },
      required: ['domain','action','args'],
      additionalProperties: false,
    },
  },
};

function safeJson(value) {
  try { return JSON.stringify(value); } catch { return JSON.stringify({ ok:false, error:'serialization_failed' }); }
}

function now() { return new Date().toISOString(); }

export class AuroraLiveSession {
  constructor({ provider, transcribe, synthesize, auraBridge, send, sessionId = randomUUID(), model = null }) {
    this.provider = provider;
    this.transcribe = transcribe;
    this.synthesize = synthesize;
    this.auraBridge = auraBridge;
    this.send = send;
    this.sessionId = sessionId;
    this.model = model || provider.model;
    this.history = [{ role: 'system', content: LIVE_SYSTEM_PROMPT }];
    this.inputChunks = [];
    this.inputBytes = 0;
    this.response = null;
    this.responseId = null;
    this.responseText = '';
    this.responseSegments = new Map();
    this.playbackMs = 0;
    this.closed = false;
    this.busy = false;
    this.turn = 0;
    this.toolCalls = new Set();
  }

  emit(type, payload = {}) {
    if (!this.closed) this.send({ type, sessionId: this.sessionId, timestamp: now(), ...payload });
  }

  configure({ model, language } = {}) {
    if (model) this.model = String(model);
    this.language = language || this.language || 'pt-BR';
    this.emit('session.updated', { model: this.model, language: this.language });
  }

  audio(chunk) {
    if (this.closed) return;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.inputChunks.push(buffer);
    this.inputBytes += buffer.length;
    if (this.inputBytes > 20 * 1024 * 1024) this.inputChunks.splice(0, Math.max(0, this.inputChunks.length - 40));
  }

  speechStarted() {
    this.emit('input_audio_buffer.speech_started');
    if (this.response) this.interrupt('user_speech');
  }

  speechStopped() {
    this.emit('input_audio_buffer.speech_stopped');
    void this.commitInput();
  }

  playbackProgress(ms) {
    this.playbackMs = Math.max(0, Number(ms) || 0);
  }

  async commitInput() {
    if (this.closed || this.busy || !this.inputBytes) return;
    const pcm = Buffer.concat(this.inputChunks);
    this.inputChunks = [];
    this.inputBytes = 0;
    this.busy = true;
    const turn = ++this.turn;
    const controller = new AbortController();
    this.response = controller;
    try {
      this.emit('input_audio_buffer.committed', { bytes: pcm.length, turn });
      const transcriptResult = await this.transcribe(pcm, controller.signal);
      if (controller.signal.aborted || this.closed) return;
      const text = String(transcriptResult?.text || '').trim();
      if (!text) {
        this.emit('input_audio_buffer.empty', { turn });
        return;
      }
      this.history.push({ role: 'user', content: text });
      this.emit('conversation.item.input_audio_transcription.completed', { text, turn });
      await this.generate(turn, controller);
    } catch (error) {
      if (!controller.signal.aborted && !this.closed) this.emit('error', { error: error instanceof Error ? error.message : String(error), turn });
    } finally {
      if (this.response === controller) this.response = null;
      this.busy = false;
      if (!this.closed && this.turn === turn) this.emit('response.done', { responseId: this.responseId, status: controller.signal.aborted ? 'cancelled' : 'completed' });
    }
  }

  async generate(turn, controller) {
    this.responseId = randomUUID();
    this.responseText = '';
    this.playbackMs = 0;
    this.emit('response.created', { responseId: this.responseId, turn, model: this.model });
    const tools = [LIVE_AURA_TOOL];
    const response = await this.provider.chat({
      messages: this.history,
      tools,
      signal: controller.signal,
      model: this.model,
      maxTokens: 700,
      temperature: 0.7,
    });
    if (controller.signal.aborted || this.closed) return;
    let message = response?.choices?.[0]?.message;
    if (!message) throw new Error('Model returned no live response.');

    if (message.tool_calls?.length) {
      this.history.push({ role: 'assistant', content: message.content || '', tool_calls: message.tool_calls });
      for (const call of message.tool_calls) {
        if (controller.signal.aborted) return;
        const result = await this.executeTool(call, controller.signal);
        this.history.push(result.message);
      }
      const followup = await this.provider.chat({ messages: this.history, tools, signal: controller.signal, model: this.model, maxTokens: 700, temperature: 0.7 });
      message = followup?.choices?.[0]?.message;
      if (!message) throw new Error('Model returned no live follow-up.');
    }

    const text = String(message.content || '').trim();
    if (!text) return;
    this.history.push({ role: 'assistant', content: text });
    await this.speakResponse(text, controller.signal, turn);
  }

  async executeTool(call, signal) {
    const id = String(call?.id || randomUUID());
    if (this.toolCalls.has(id)) return { message: { role: 'tool', tool_call_id: id, content: safeJson({ ok:false, error:'duplicate_tool_call' }) } };
    this.toolCalls.add(id);
    let args = {};
    try { args = JSON.parse(call.function?.arguments || '{}'); } catch {}
    if (call.function?.name !== 'aura_action') return { message: { role:'tool', tool_call_id:id, content:safeJson({ok:false,error:'unknown_tool'}) } };
    const { domain, action } = args;
    const result = this.auraBridge
      ? await this.auraBridge.dispatch({ domain: String(domain || ''), action: String(action || ''), args: args.args && typeof args.args === 'object' ? args.args : {}, signal })
      : { ok:false, dispatched:false, reason:'Aura bridge is not configured.' };
    this.emit('tool.completed', { callId:id, name:'aura_action', result });
    return { message: { role:'tool', tool_call_id:id, content:safeJson(result) } };
  }

  async speakResponse(text, signal, turn) {
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(s => s.trim()).filter(Boolean) || [text];
    this.emit('response.text.completed', { responseId:this.responseId, text, turn });
    for (const sentence of sentences) {
      if (signal.aborted || this.closed) return;
      const segmentId = randomUUID();
      this.responseSegments.set(segmentId, { text: sentence, startedAt: Date.now() });
      this.emit('response.audio.segment.started', { responseId:this.responseId, segmentId, text:sentence });
      const audio = await this.synthesize(sentence, signal);
      if (signal.aborted || this.closed) return;
      this.emit('response.audio.segment', {
        responseId:this.responseId,
        segmentId,
        text:sentence,
        contentType:audio.contentType,
        durationMs:audio.durationMs || 0,
        data:audio.buffer.toString('base64'),
      });
      this.emit('response.audio.segment.done', { responseId:this.responseId, segmentId });
    }
  }

  interrupt(reason = 'user_speech') {
    const responseId = this.responseId;
    const heardMs = this.playbackMs;
    const controller = this.response;
    if (controller && !controller.signal.aborted) controller.abort();
    if (!responseId) return;
    this.emit('response.cancelled', { responseId, reason });
    this.emit('response.audio.cleared', { responseId });
    this.emit('conversation.item.truncated', { responseId, audioEndMs:heardMs });
    this.responseText = '';
    this.responseId = null;
    this.responseSegments.clear();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.response?.abort();
    this.inputChunks = [];
    this.responseSegments.clear();
    this.emit('session.closed');
  }
}
