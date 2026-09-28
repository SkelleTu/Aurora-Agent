import { randomUUID } from 'node:crypto';
import { ResponseCreateSequencer } from './response-sequencer.mjs';
import { PlaybackTracker } from './playback-tracker.mjs';
import { LIVE_SYSTEM_PROMPT, LIVE_AURA_TOOL } from './tools.mjs';

function safeJson(value) {
  try { return JSON.stringify(value); } catch { return JSON.stringify({ ok:false, error:'serialization_failed' }); }
}

function now() { return new Date().toISOString(); }

export class AuroraLiveSession {
  constructor({ provider, transcribe, synthesize, auraBridge, send, realtimeAdapterFactory = null, transcriberFactory = null, sessionId = randomUUID(), model = null }) {
    this.provider = provider;
    this.transcribe = transcribe;
    this.synthesize = synthesize;
    this.auraBridge = auraBridge;
    this.send = send;
    this.sessionId = sessionId;
    this.model = model || provider.model;
    this.realtimeAdapterFactory = realtimeAdapterFactory;
    this.transcriberFactory = transcriberFactory;
    this.transcriber = null;
    this.realtimeAdapter = null;
    this.responseSequencer = new ResponseCreateSequencer();
    this.playbackTracker = new PlaybackTracker();
    this.inputTranscript = '';
    this.outputTranscript = '';
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

  wireRealtimeAdapter(adapter) {
    this.realtimeAdapter = adapter;
    adapter.on('connected', ({ model }) => this.emit('session.updated', { model: model || this.model, language: this.language, nativeAudio: true, transport: 'realtime-model' }));
    adapter.on('input_transcript_delta', ({ text, final = false, interim = false, replace = false }) => {
      const value = String(text || '');
      if (!value) return;
      if (interim || replace) {
        this.inputTranscript = value;
        this.emit('conversation.item.input_audio_transcription.delta', { text: value, interim: Boolean(interim), final: Boolean(final), replace: true });
        if (!final) return;
      } else {
        this.inputTranscript += value;
        this.emit('conversation.item.input_audio_transcription.delta', { text: value, final: Boolean(final), replace: false });
      }
      if (final) {
        const completed = this.inputTranscript.trim();
        if (completed) {
          this.emit('conversation.item.input_audio_transcription.completed', { text: completed });
          this.history.push({ role: 'user', content: completed });
        }
        this.inputTranscript = '';
      }
    });
    adapter.on('output_transcript_delta', ({ text }) => { this.outputTranscript += String(text || ''); this.emit('response.audio.transcript.delta', { responseId: this.responseId, delta: String(text || '') }); });
    adapter.on('output_text_delta', ({ text }) => this.emit('response.text.delta', { responseId: this.responseId, delta: String(text || '') }));
    adapter.on('audio_delta', ({ responseId, data, sampleRate = 24000, channels = 1, encoding = 'pcm_s16le' }) => {
      const nextId = responseId || this.responseId || randomUUID();
      const isNewResponse = this.responseId !== nextId;
      this.responseId = nextId;
      if (isNewResponse) { this.responseSequencer.begin(this.responseId); this.playbackTracker.start(this.responseId); this.emit('response.created', { responseId: this.responseId, model: this.model, nativeAudio: true }); }
      this.emit('response.audio.delta', { responseId: this.responseId, sampleRate, channels, encoding, data: Buffer.from(data).toString('base64') });
    });
    adapter.on('audio_done', ({ responseId }) => this.emit('response.audio.done', { responseId: responseId || this.responseId }));
    adapter.on('response_done', ({ responseId }) => { this.emit('response.done', { responseId: responseId || this.responseId, status: 'completed', nativeAudio: true }); this.responseSequencer.clear(responseId || this.responseId); this.playbackTracker.stop(); this.responseId = null; this.outputTranscript = ''; });
    adapter.on('audio_interrupted', ({ responseId }) => { const id = responseId || this.responseId; if (id) { const heardMs = this.playbackTracker.current(); this.emit('response.audio.interrupted', { responseId: id, audioEndMs: heardMs }); this.emit('conversation.item.truncated', { responseId: id, audioEndMs: heardMs }); } });
    adapter.on('tool_completed', (payload) => this.emit('tool.completed', payload));
    adapter.on('error', ({ error }) => this.emit('error', { error }));
    adapter.on('closed', ({ reason }) => { if (!this.closed) this.emit('session.transport_closed', { reason }); });
  }

  wireTranscriber(transcriber) {
    this.transcriber = transcriber;
    transcriber.on('connected', ({ model }) => this.emit('input_transcription.connected', { model }));
    transcriber.on('interim', ({ text }) => this.emit('conversation.item.input_audio_transcription.delta', { text: String(text || ''), interim: true, replace: true }));
    transcriber.on('final', ({ text }) => {
      const value = String(text || '').trim();
      if (value) {
        this.emit('conversation.item.input_audio_transcription.completed', { text: value });
        this.history.push({ role: 'user', content: value });
      }
    });
    transcriber.on('error', ({ error }) => this.emit('error', { error: `Transcription: ${error}` }));
  }

  emit(type, payload = {}) {
    if (!this.closed) this.send({ type, sessionId: this.sessionId, timestamp: now(), ...payload });
  }

  async configure({ model, language } = {}) {
    if (model) this.model = String(model);
    this.language = language || this.language || 'pt-BR';
    if (this.realtimeAdapterFactory && !this.realtimeAdapter) {
      this.realtimeAdapter = this.realtimeAdapterFactory({ model: this.model, language: this.language });
      this.wireRealtimeAdapter(this.realtimeAdapter);
      if (this.transcriberFactory && !this.transcriber) {
        this.transcriber = this.transcriberFactory({ language: this.language });
        this.wireTranscriber(this.transcriber);
      }
      await Promise.all([this.realtimeAdapter.connect(), this.transcriber ? this.transcriber.connect() : Promise.resolve()]);
    } else if (!this.realtimeAdapter) {
      this.emit('session.updated', { model: this.model, language: this.language, nativeAudio: false, transport: 'pipeline' });
    }
  }

  audio(chunk) {
    if (this.closed) return;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (this.realtimeAdapter) {
      this.realtimeAdapter.sendAudio(buffer);
      if (this.transcriber) this.transcriber.sendAudio(buffer);
      return;
    }
    this.inputChunks.push(buffer);
    this.inputBytes += buffer.length;
    if (this.inputBytes > 20 * 1024 * 1024) this.inputChunks.splice(0, Math.max(0, this.inputChunks.length - 40));
  }

  speechStarted() {
    this.emit('input_audio_buffer.speech_started');
    if (this.realtimeAdapter) { this.realtimeAdapter.interrupt(); return; }
    if (this.response) this.interrupt('user_speech');
  }

  speechStopped() {
    this.emit('input_audio_buffer.speech_stopped');
    if (this.realtimeAdapter) {
      this.realtimeAdapter.commitInput();
      if (this.transcriber) this.transcriber.commitInput();
      return;
    }
    void this.commitInput();
  }

  playbackProgress(ms) {
    this.playbackMs = Math.max(0, Number(ms) || 0);
    this.playbackTracker.progress(this.playbackMs);
  }

  async commitInput() {
    if (this.realtimeAdapter) return;
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
    this.emit('response.created', { responseId:this.responseId, turn, model:this.model });

    const tools = [LIVE_AURA_TOOL];
    let streamedText = '';
    const toolCalls = [];
    let spokenUntil = 0;

    if (typeof this.provider.chatStream === 'function') {
      for await (const delta of this.provider.chatStream({
        messages:this.history,
        tools,
        signal:controller.signal,
        model:this.model,
        maxTokens:700,
        temperature:0.7,
      })) {
        if (controller.signal.aborted || this.closed) return;

        for (const part of delta.toolCalls || []) {
          const index = Number(part.index ?? 0);
          toolCalls[index] ||= { id:part.id || randomUUID(), type:'function', function:{ name:'', arguments:'' } };
          if (part.id) toolCalls[index].id = part.id;
          if (part.function?.name) toolCalls[index].function.name += part.function.name;
          if (part.function?.arguments) toolCalls[index].function.arguments += part.function.arguments;
        }

        if (delta.content) {
          streamedText += delta.content;
          this.responseText = streamedText;
          this.emit('response.text.delta', { responseId:this.responseId, delta:delta.content, turn });

          if (!toolCalls.length) {
            let boundary = -1;
            for (let i=spokenUntil;i<streamedText.length;i++) {
              const ch = streamedText[i];
              const next = streamedText[i+1] || '';
              if ((ch === '.' || ch === '!' || ch === '?') && (!next || /\\s/.test(next))) {
                boundary = i + 1;
                break;
              }
            }
            if (boundary > spokenUntil) {
              const sentence = streamedText.slice(spokenUntil,boundary).trim();
              spokenUntil = boundary;
              if (sentence) await this.speakSegment(sentence, controller.signal, turn);
            }
          }
        }
      }
    } else {
      const response = await this.provider.chat({ messages:this.history, tools, signal:controller.signal, model:this.model, maxTokens:700, temperature:0.7 });
      const message = response?.choices?.[0]?.message;
      if (!message) throw new Error('Model returned no live response.');
      streamedText = String(message.content || '');
      toolCalls.push(...(message.tool_calls || []));
    }

    if (controller.signal.aborted || this.closed) return;

    if (toolCalls.length) {
      this.history.push({ role:'assistant', content:streamedText, tool_calls:toolCalls });
      for (const call of toolCalls) {
        if (controller.signal.aborted) return;
        const result = await this.executeTool(call, controller.signal);
        this.history.push(result.message);
      }
      const followup = await this.provider.chat({ messages:this.history, tools, signal:controller.signal, model:this.model, maxTokens:700, temperature:0.7 });
      const message = followup?.choices?.[0]?.message;
      if (!message) throw new Error('Model returned no live follow-up.');
      streamedText = String(message.content || '').trim();
      if (streamedText) await this.speakResponse(streamedText, controller.signal, turn);
    } else {
      const remaining = streamedText.slice(spokenUntil).trim();
      if (remaining) await this.speakSegment(remaining, controller.signal, turn);
    }

    if (streamedText.trim()) {
      this.history.push({ role:'assistant', content:streamedText.trim() });
      this.emit('response.text.completed', { responseId:this.responseId, text:streamedText.trim(), turn });
    }
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
    if (this.realtimeAdapter) {
      const responseId = this.responseId;
      const heardMs = this.playbackTracker.current();
      this.realtimeAdapter.interrupt();
      if (responseId) {
        this.emit('response.cancelled', { responseId, reason });
        this.emit('response.audio.cleared', { responseId });
        this.emit('conversation.item.truncated', { responseId, audioEndMs: heardMs });
      }
      this.responseSequencer.cancel(responseId);
      this.playbackTracker.stop();
      this.responseId = null;
      return;
    }
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
    this.realtimeAdapter?.close();
    this.transcriber?.close();
    this.inputChunks = [];
    this.responseSegments.clear();
    this.emit('session.closed');
  }
}
