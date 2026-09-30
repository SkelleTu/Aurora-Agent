import WebSocket from 'ws';
import { RealtimeModelAdapter } from './model-adapter.mjs';
import { LIVE_SYSTEM_PROMPT, LIVE_AURA_TOOL } from './tools.mjs';
import { recordLiveTelemetry } from './telemetry.mjs';

const ENDPOINT = 'wss://api.openai.com/v1/realtime';

export class OpenAILiveAdapter extends RealtimeModelAdapter {
  constructor({ apiKey, model = 'gpt-realtime-2.1', language = 'pt-BR', voice = 'cedar', auraBridge, sessionId = null }) {
    super();
    if (!apiKey) throw new Error('OPENAI_API_KEY is required for OpenAI Realtime.');
    this.apiKey = apiKey; this.model = model; this.language = language; this.voice = voice;
    this.auraBridge = auraBridge; this.sessionId = sessionId; this.socket = null;
    this.connected = false; this.sessionReady = false; this.responseId = null; this.pendingAudio = [];
  }
  async connect() {
    this.socket = new WebSocket(`${ENDPOINT}?model=${encodeURIComponent(this.model)}`, { headers: { Authorization: `Bearer ${this.apiKey}` } });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('OpenAI Realtime connection timeout.')), 12000);
      this.socket.once('open', () => { clearTimeout(timer); resolve(); });
      this.socket.once('error', error => { clearTimeout(timer); reject(error); });
    });
    this.connected = true;
    this.socket.on('message', data => void this.handleMessage(JSON.parse(String(data))));
    this.socket.on('error', error => this.emit('error', { error: error?.message || String(error) }));
    this.socket.on('close', (code, reason) => { this.connected = false; this.sessionReady = false; this.emit('closed', { code, reason: String(reason || '') }); });
    this.send({ type: 'session.update', session: {
      type: 'realtime',
      instructions: `${LIVE_SYSTEM_PROMPT} Fale naturalmente em ${this.language}. Use aura_action para operar o Aura System. Nunca afirme que uma ação foi concluída sem confirmação da ferramenta.`,
      output_modalities: ['audio'],
      audio: {
        input: { format: { type: 'audio/pcm', rate: 16000 }, transcription: { model: 'gpt-4o-mini-transcribe', language: this.language }, turn_detection: null },
        output: { format: { type: 'audio/pcm', rate: 24000 }, voice: this.voice },
      },
      tools: [LIVE_AURA_TOOL.function], tool_choice: 'auto',
    }});
    recordLiveTelemetry('openai_session_update_sent', this.sessionId, { model: this.model, voice: this.voice });
  }
  send(event) { if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(event)); }
  sendAudio(buffer) {
    if (!buffer?.length) return;
    if (!this.sessionReady) { this.pendingAudio.push(Buffer.from(buffer)); return; }
    this.send({ type: 'input_audio_buffer.append', audio: Buffer.from(buffer).toString('base64') });
  }
  commitInput() {
    if (!this.connected) return;
    this.send({ type: 'input_audio_buffer.commit' });
    this.send({ type: 'response.create', response: { output_modalities: ['audio'] } });
  }
  interrupt() { if (this.connected) this.send({ type: 'response.cancel' }); this.emit('audio_interrupted', { responseId: this.responseId }); }
  async handleMessage(message) {
    const type = message?.type;
    if (type === 'session.updated') {
      this.sessionReady = true; this.emit('connected', { model: this.model });
      for (const buffer of this.pendingAudio.splice(0)) this.sendAudio(buffer);
      return;
    }
    if (type === 'error') { this.emit('error', { error: message.error?.message || JSON.stringify(message.error || message) }); return; }
    if (type === 'conversation.item.input_audio_transcription.delta') { this.emit('input_transcript_delta', { text: message.delta || '', interim: true }); return; }
    if (type === 'conversation.item.input_audio_transcription.completed') { this.emit('input_transcript_delta', { text: message.transcript || '', final: true, replace: true }); return; }
    if (type === 'response.created') { this.responseId = message.response?.id || this.responseId || crypto.randomUUID(); return; }
    if (type === 'response.output_audio.delta') {
      const responseId = message.response_id || this.responseId || crypto.randomUUID(); this.responseId = responseId;
      this.emit('audio_delta', { responseId, data: Buffer.from(message.delta || '', 'base64'), sampleRate: 24000, channels: 1, encoding: 'pcm_s16le' }); return;
    }
    if (type === 'response.output_audio_transcript.delta') { this.emit('output_transcript_delta', { text: message.delta || '' }); return; }
    if (type === 'response.output_text.delta') { this.emit('output_text_delta', { text: message.delta || '' }); return; }
    if (type === 'response.function_call_arguments.done') {
      const callId = message.call_id; const name = message.name || 'aura_action'; let args = {};
      try { args = JSON.parse(message.arguments || '{}'); } catch { args = {}; }
      let result = { ok: false, error: 'unknown_tool' };
      if (name === 'aura_action') {
        try { result = this.auraBridge ? await this.auraBridge.dispatch({ domain: String(args.domain || ''), action: String(args.action || ''), args: args.args && typeof args.args === 'object' ? args.args : {} }) : { ok:false, error:'Aura bridge unavailable' }; }
        catch (error) { result = { ok:false, error:error instanceof Error ? error.message : String(error) }; }
      }
      this.emit('tool_completed', { callId, name, result });
      this.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(result) } });
      this.send({ type: 'response.create', response: { output_modalities: ['audio'] } });
      return;
    }
    if (type === 'response.output_audio.done') { this.emit('audio_done', { responseId: this.responseId }); return; }
    if (type === 'response.cancelled') { this.emit('audio_interrupted', { responseId: this.responseId }); return; }
    if (type === 'response.done') { this.emit('response_done', { responseId: this.responseId }); this.responseId = null; }
  }
  close() { try { this.socket?.close(); } catch {} this.socket = null; this.connected = false; this.sessionReady = false; this.pendingAudio = []; this.responseId = null; }
}