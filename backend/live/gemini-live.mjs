import WebSocket from 'ws';
import { RealtimeModelAdapter } from './model-adapter.mjs';
import { LIVE_AURA_TOOL } from './tools.mjs';

const ENDPOINT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

function geminiTool() {
  const fn = LIVE_AURA_TOOL.function;
  return { name: fn.name, description: fn.description, parameters: fn.parameters };
}

export class GeminiLiveAdapter extends RealtimeModelAdapter {
  constructor({ apiKey, model = 'gemini-3.8-live', language = 'pt-BR', auraBridge }) {
    super();
    if (!apiKey) throw new Error('GOOGLE_API_KEY is required for Gemini Live.');
    this.apiKey = apiKey;
    this.model = model;
    this.language = language;
    this.auraBridge = auraBridge;
    this.socket = null;
    this.responseId = null;
    this.connected = false;
    this.setupComplete = false;
    this.pendingAudio = [];
    this.pendingCommit = false;
  }

  async connect() {
    const url = `${ENDPOINT}?key=${encodeURIComponent(this.apiKey)}`;
    this.socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Gemini Live connection timeout.')), 12000);
      this.socket.once('open', () => { clearTimeout(timer); resolve(); });
      this.socket.once('error', (error) => { clearTimeout(timer); reject(error); });
    });
    this.connected = true;
    this.socket.on('message', (data) => void this.handleMessage(JSON.parse(String(data))));
    this.socket.on('error', (error) => this.emit('error', { error: error?.message || String(error) }));
    this.socket.on('close', (code, reason) => { this.connected = false; this.emit('closed', { code, reason: String(reason || '') }); });

    this.socket.send(JSON.stringify({
      setup: {
        model: `models/${this.model}`,
        generationConfig: { responseModalities: ['AUDIO'] },
        systemInstruction: { parts: [{ text: `Você é Aurora, o agente de voz do Aura System. Responda naturalmente em ${this.language}. Seja concisa e conversacional. Use a ferramenta aura_action para operar o Aura System e nunca afirme que uma ação ocorreu sem confirmação.` }] },
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            prefixPaddingMs: 120,
            silenceDurationMs: 420,
          },
          activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
        },
        tools: [{ functionDeclarations: [geminiTool()] }],
        // The same native-audio Live session also emits incremental input transcription.
        // This keeps the microphone, agent audio, VAD and transcript on one connection.
        inputAudioTranscription: { languageCodes: [this.language], mode: 'VERBATIM' },
        outputAudioTranscription: {},
      },
    }));
    return this;
  }

  sendAudio(buffer) {
    if (!this.connected || !buffer?.length) return;
    if (!this.setupComplete) {
      this.pendingAudio.push(Buffer.from(buffer));
      return;
    }
    this.socket.send(JSON.stringify({
      realtimeInput: {
        audio: { data: Buffer.from(buffer).toString('base64'), mimeType: 'audio/pcm;rate=16000' },
      },
    }));
  }

  commitInput() {
    if (!this.connected) return;
    if (!this.setupComplete) { this.pendingCommit = true; return; }
    this.socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
  }

  interrupt() {
    this.emit('audio_interrupted', { responseId: this.responseId });
  }

  async sendToolResponse(functionResponses) {
    if (!this.connected || !this.setupComplete) return;
    this.socket.send(JSON.stringify({ toolResponse: { functionResponses } }));
  }

  async handleMessage(message) {
    if (message.setupComplete) {
      this.setupComplete = true;
      this.emit('connected', { model: this.model });
      const queued = this.pendingAudio.splice(0);
      for (const buffer of queued) {
        this.socket.send(JSON.stringify({ realtimeInput: { audio: { data: buffer.toString('base64'), mimeType: 'audio/pcm;rate=16000' } } }));
      }
      if (this.pendingCommit) {
        this.pendingCommit = false;
        this.socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      }
      return;
    }
    const content = message.serverContent;
    if (content?.interimInputTranscription?.text) this.emit('input_transcript_delta', { text: content.interimInputTranscription.text, interim: true, replace: true });
    if (content?.inputTranscription?.text) this.emit('input_transcript_delta', { text: content.inputTranscription.text, final: true, replace: true });
    if (content?.outputTranscription?.text) this.emit('output_transcript_delta', { text: content.outputTranscription.text });

    for (const part of content?.modelTurn?.parts || []) {
      if (part?.inlineData?.data) {
        const responseId = this.responseId || crypto.randomUUID();
        this.responseId = responseId;
        this.emit('audio_delta', { responseId, data: Buffer.from(part.inlineData.data, 'base64'), sampleRate: 24000, channels: 1, encoding: 'pcm_s16le' });
      }
      if (part?.text) this.emit('output_text_delta', { text: part.text });
    }

    if (message.toolCall?.functionCalls?.length) {
      const functionResponses = [];
      for (const call of message.toolCall.functionCalls) {
        if (call.name !== 'aura_action') {
          functionResponses.push({ id: call.id, name: call.name, response: { error: 'unknown_tool' } });
          continue;
        }
        let result;
        try {
          const args = call.args && typeof call.args === 'object' ? call.args : {};
          result = this.auraBridge
            ? await this.auraBridge.dispatch({ domain: String(args.domain || ''), action: String(args.action || ''), args: args.args && typeof args.args === 'object' ? args.args : {} })
            : { ok: false, error: 'Aura bridge unavailable' };
          this.emit('tool_completed', { callId: call.id, name: call.name, result });
        } catch (error) {
          result = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        functionResponses.push({ id: call.id, name: call.name, response: { result } });
      }
      await this.sendToolResponse(functionResponses);
    }

    if (content?.interrupted) {
      this.emit('audio_interrupted', { responseId: this.responseId });
    }
    if (content?.turnComplete) {
      const responseId = this.responseId;
      this.emit('audio_done', { responseId });
      this.emit('response_done', { responseId });
      this.responseId = null;
    }
  }

  close() {
    try { this.socket?.close(); } catch {}
    this.socket = null;
    this.connected = false;
    this.setupComplete = false;
    this.pendingAudio = [];
    this.pendingCommit = false;
    this.responseId = null;
  }
}
