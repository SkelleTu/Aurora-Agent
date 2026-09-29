import WebSocket from 'ws';
import { RealtimeModelAdapter } from './model-adapter.mjs';
import { LIVE_AURA_TOOL } from './tools.mjs';

const ENDPOINT = 'wss://api.openai.com/v1/realtime';

function toolDefinition() {
  const fn = LIVE_AURA_TOOL.function;
  return { type: 'function', name: fn.name, description: fn.description, parameters: fn.parameters };
}

function resamplePcm16(buffer, fromRate = 16000, toRate = 24000) {
  if (fromRate === toRate) return buffer;
  const input = new Int16Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 2));
  const length = Math.max(1, Math.round(input.length * toRate / fromRate));
  const output = new Int16Array(length);
  const ratio = fromRate / toRate;
  for (let i = 0; i < length; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(input.length - 1, left + 1);
    const fraction = position - left;
    output[i] = Math.round(input[left] * (1 - fraction) + input[right] * fraction);
  }
  return Buffer.from(output.buffer);
}

export class OpenAILiveAdapter extends RealtimeModelAdapter {
  constructor({ apiKey, model = 'gpt-realtime-2.1', language = 'pt-BR', auraBridge, sessionId = null }) {
    super();
    if (!apiKey) throw new Error('OPENAI_API_KEY is required for OpenAI Realtime.');
    this.apiKey = apiKey;
    this.model = model;
    this.language = language;
    this.auraBridge = auraBridge;
    this.sessionId = sessionId;
    this.socket = null;
    this.connected = false;
    this.responseId = null;
    this.pendingAudio = [];
    this.pendingCommit = false;
  }

  async connect() {
    const url = `${ENDPOINT}?model=${encodeURIComponent(this.model)}`;
    this.socket = new WebSocket(url, { headers: { Authorization: `Bearer ${this.apiKey}` } });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('OpenAI Realtime connection timeout.')), 12000);
      this.socket.once('open', () => { clearTimeout(timer); resolve(); });
      this.socket.once('error', (error) => { clearTimeout(timer); reject(error); });
    });
    this.connected = true;
    this.socket.on('message', (data) => void this.handleMessage(JSON.parse(String(data))));
    this.socket.on('error', (error) => this.emit('error', { error: error?.message || String(error) }));
    this.socket.on('close', (code, reason) => { this.connected = false; this.emit('closed', { code, reason: String(reason || '') }); });
    this.send({ type: 'session.update', session: {
      type: 'realtime', model: this.model,
      instructions: `Você é Aurora, o agente de voz do Aura System. Responda naturalmente em ${this.language}. Seja concisa e conversacional. Use a ferramenta aura_action para operar o Aura System e nunca afirme que uma ação ocorreu sem confirmação.`,
      output_modalities: ['audio'],
      audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, turn_detection: { type: 'server_vad', prefix_padding_ms: 120, silence_duration_ms: 420, create_response: true, interrupt_response: true } }, output: { format: { type: 'audio/pcm', rate: 24000 }, voice: 'marin' } },
      input_audio_transcription: { model: 'gpt-realtime-whisper', language: this.language },
      tools: [toolDefinition()], tool_choice: 'auto',
    } });
    return this;
  }

  send(payload) { if (this.connected && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload)); }
  sendAudio(buffer) { if (!buffer?.length) return; const pcm24 = resamplePcm16(Buffer.from(buffer)); if (!this.connected) { this.pendingAudio.push(pcm24); return; } this.send({ type: 'input_audio_buffer.append', audio: pcm24.toString('base64') }); }
  commitInput() { if (!this.connected) { this.pendingCommit = true; return; } this.send({ type: 'input_audio_buffer.commit' }); }
  interrupt() { if (!this.connected) return; this.send({ type: 'response.cancel' }); this.emit('audio_interrupted', { responseId: this.responseId }); }
  async sendToolResponse(items) { for (const item of items || []) this.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: item.call_id || item.id, output: JSON.stringify(item.output ?? item.response ?? {}) } }); if (items?.length) this.send({ type: 'response.create', response: { output_modalities: ['audio'] } }); }

  async handleMessage(message) {
    const type = String(message?.type || '');
    if (type === 'session.updated') { this.emit('connected', { model: message.session?.model || this.model }); for (const b of this.pendingAudio.splice(0)) this.send({ type: 'input_audio_buffer.append', audio: b.toString('base64') }); if (this.pendingCommit) { this.pendingCommit = false; this.commitInput(); } return; }
    if (type === 'error') { this.emit('error', { error: message.error?.message || JSON.stringify(message.error || message) }); return; }
    if (type === 'conversation.item.input_audio_transcription.delta') this.emit('input_transcript_delta', { text: message.delta || '', interim: true, replace: true });
    if (type === 'conversation.item.input_audio_transcription.completed') this.emit('input_transcript_delta', { text: message.transcript || '', final: true, replace: true });
    if (type === 'response.output_audio_transcript.delta') this.emit('output_transcript_delta', { text: message.delta || '' });
    if (type === 'response.output_text.delta') this.emit('output_text_delta', { text: message.delta || '' });
    if (type === 'response.output_audio.delta') { const responseId = message.response_id || this.responseId || crypto.randomUUID(); this.responseId = responseId; this.emit('audio_delta', { responseId, data: Buffer.from(message.delta || '', 'base64'), sampleRate: 24000, channels: 1, encoding: 'pcm_s16le' }); }
    if (type === 'response.output_audio.done') this.emit('audio_done', { responseId: message.response_id || this.responseId });
    if (type === 'response.done') { const responseId = message.response?.id || message.response_id || this.responseId; this.emit('response_done', { responseId }); this.responseId = null; }
    if (type === 'response.cancelled') this.emit('audio_interrupted', { responseId: message.response_id || this.responseId });
    if (type === 'response.function_call_arguments.done') {
      let args = {}; try { args = JSON.parse(message.arguments || '{}'); } catch {}
      let result;
      try { result = message.name === 'aura_action' && this.auraBridge ? await this.auraBridge.dispatch({ domain: String(args.domain || ''), action: String(args.action || ''), args: args.args && typeof args.args === 'object' ? args.args : {} }) : { ok: false, error: 'unknown_tool_or_bridge_unavailable' }; }
      catch (error) { result = { ok: false, error: error instanceof Error ? error.message : String(error) }; }
      this.emit('tool_completed', { callId: message.call_id, name: message.name, result });
      await this.sendToolResponse([{ call_id: message.call_id, output: result }]);
    }
  }

  close() { try { this.socket?.close(); } catch {} this.socket = null; this.connected = false; this.pendingAudio = []; this.pendingCommit = false; this.responseId = null; }
}
