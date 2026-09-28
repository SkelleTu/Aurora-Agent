import WebSocket from 'ws';

const ENDPOINT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

export class GeminiLiveTranscriber {
  constructor({ apiKey, language = 'pt-BR', model = 'gemini-3.5-transcribe-live' }) {
    if (!apiKey) throw new Error('GOOGLE_API_KEY is required for Live transcription.');
    this.apiKey = apiKey; this.language = language; this.model = model;
    this.socket = null; this.connected = false; this.setupComplete = false;
    this.pendingAudio = []; this.pendingCommit = false; this.listeners = new Map();
  }
  on(type, listener) { const set = this.listeners.get(type) || new Set(); set.add(listener); this.listeners.set(type, set); return () => set.delete(listener); }
  emit(type, payload = {}) { for (const listener of this.listeners.get(type) || []) listener(payload); }
  async connect() {
    this.socket = new WebSocket(`${ENDPOINT}?key=${encodeURIComponent(this.apiKey)}`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Live transcription connection timeout.')), 12000);
      this.socket.once('open', () => { clearTimeout(timer); resolve(); });
      this.socket.once('error', e => { clearTimeout(timer); reject(e); });
    });
    this.connected = true;
    this.socket.on('message', data => { try { this.handleMessage(JSON.parse(String(data))); } catch (e) { this.emit('error', { error: e instanceof Error ? e.message : String(e) }); } });
    this.socket.on('error', e => this.emit('error', { error: e?.message || String(e) }));
    this.socket.on('close', (code, reason) => { this.connected = false; this.emit('closed', { code, reason: String(reason || '') }); });
    this.socket.send(JSON.stringify({ setup: { model: `models/${this.model}`, generationConfig: { responseModalities: ['TEXT'] }, inputAudioTranscription: { languageCodes: [this.language], mode: 'VERBATIM' } } }));
  }
  sendAudio(buffer) {
    if (!this.connected || !buffer?.length) return;
    if (!this.setupComplete) { this.pendingAudio.push(Buffer.from(buffer)); return; }
    this.socket.send(JSON.stringify({ realtimeInput: { audio: { data: Buffer.from(buffer).toString('base64'), mimeType: 'audio/pcm;rate=16000' } } }));
  }
  commitInput() {
    if (!this.connected) return;
    if (!this.setupComplete) { this.pendingCommit = true; return; }
    this.socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
  }
  handleMessage(message) {
    if (message.setupComplete) {
      this.setupComplete = true; this.emit('connected', { model: this.model });
      for (const buffer of this.pendingAudio.splice(0)) this.sendAudio(buffer);
      if (this.pendingCommit) { this.pendingCommit = false; this.commitInput(); }
      return;
    }
    const content = message.serverContent;
    if (content?.interimInputTranscription?.text) this.emit('interim', { text: content.interimInputTranscription.text });
    if (content?.inputTranscription?.text) this.emit('final', { text: content.inputTranscription.text });
  }
  close() { try { this.socket?.close(); } catch {} this.socket = null; this.connected = false; this.setupComplete = false; this.pendingAudio = []; this.pendingCommit = false; }
}
