import WebSocket from 'ws';
import { RealtimeModelAdapter } from './model-adapter.mjs';
import { LIVE_AURA_TOOL } from './tools.mjs';

const ENDPOINT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const DIAGNOSTICS = String(process.env.AURORA_LIVE_DIAGNOSTICS ?? 'true').toLowerCase() !== 'false';

function diag(event, details = {}) {
  if (!DIAGNOSTICS) return;
  console.log('[AuroraLive]', JSON.stringify({ event, ts: new Date().toISOString(), ...details }));
}

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
    this.audioChunks = 0;
    this.audioBytes = 0;
  }

  async connect() {
    diag('gemini_connect_start', { model: this.model, language: this.language });
    const url = `${ENDPOINT}?key=${encodeURIComponent(this.apiKey)}`;
    this.socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Gemini Live connection timeout.')), 12000);
      this.socket.once('open', () => { clearTimeout(timer); resolve(); });
      this.socket.once('error', (error) => { clearTimeout(timer); reject(error); });
    });
    this.connected = true;
    diag('gemini_socket_open');
    this.socket.on('message', (data) => void this.handleMessage(JSON.parse(String(data))));
    this.socket.on('error', (error) => {
      diag('gemini_socket_error', { error: error?.message || String(error) });
      this.emit('error', { error: error?.message || String(error) });
    });
    this.socket.on('close', (code, reason) => {
      this.connected = false;
      diag('gemini_socket_close', { code, reason: String(reason || '') });
      this.emit('closed', { code, reason: String(reason || '') });
    });

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
        inputAudioTranscription: { languageCodes: [this.language], mode: 'VERBATIM' },
        outputAudioTranscription: {},
      },
    }));
    diag('gemini_setup_sent', { inputTranscription: true, outputTranscription: true, nativeAudio: true });
    return this;
  }

  sendAudio(buffer) {
    if (!this.connected || !buffer?.length) return;
    this.audioChunks += 1;
    this.audioBytes += buffer.length;
    if (this.audioChunks === 1 || this.audioChunks % 50 === 0) {
      diag('audio_to_gemini', { chunks: this.audioChunks, bytes: this.audioBytes, latestBytes: buffer.length });
    }
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
    diag('audio_commit', { chunks: this.audioChunks, bytes: this.audioBytes, setupComplete: this.setupComplete });
    if (!this.setupComplete) { this.pendingCommit = true; return; }
    this.socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
  }

  interrupt() {
    diag('audio_interrupt', { responseId: this.responseId });
    this.emit('audio_interrupted', { responseId: this.responseId });
  }

  async sendToolResponse(functionResponses) {
    if (!this.connected || !this.setupComplete) return;
    diag('tool_response_sent', { count: functionResponses.length });
    this.socket.send(JSON.stringify({ toolResponse: { functionResponses } }));
  }

  async handleMessage(message) {
    if (message.setupComplete) {
      this.setupComplete = true;
      diag('gemini_setup_complete', { queuedAudioChunks: this.pendingAudio.length, pendingCommit: this.pendingCommit });
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
    if (message.error) {
      diag('gemini_protocol_error', { error: message.error });
      this.emit('error', { error: JSON.stringify(message.error) });
      return;
    }
    const content = message.serverContent;
    if (content?.interimInputTranscription?.text) {
      const text = content.interimInputTranscription.text;
      diag('input_transcript_interim', { chars: text.length });
      this.emit('input_transcript_delta', { text, interim: true, replace: true });
    }
    if (content?.inputTranscription?.text) {
      const text = content.inputTranscription.text;
      diag('input_transcript_final', { chars: text.length });
      this.emit('input_transcript_delta', { text, final: true, replace: true });
    }
    if (content?.outputTranscription?.text) {
      const text = content.outputTranscription.text;
      diag('output_transcript_delta', { chars: text.length });
      this.emit('output_transcript_delta', { text });
    }

    for (const part of content?.modelTurn?.parts || []) {
      if (part?.inlineData?.data) {
        const responseId = this.responseId || crypto.randomUUID();
        this.responseId = responseId;
        this.emit('audio_delta', { responseId, data: Buffer.from(part.inlineData.data, 'base64'), sampleRate: 24000, channels: 1, encoding: 'pcm_s16le' });
      }
      if (part?.text) {
        diag('output_text_delta', { chars: part.text.length });
        this.emit('output_text_delta', { text: part.text });
      }
    }

    if (message.toolCall?.functionCalls?.length) {
      diag('tool_call_received', { count: message.toolCall.functionCalls.length });
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
      diag('response_interrupted', { responseId: this.responseId });
      this.emit('audio_interrupted', { responseId: this.responseId });
    }
    if (content?.turnComplete) {
      const responseId = this.responseId;
      diag('response_complete', { responseId });
      this.emit('audio_done', { responseId });
      this.emit('response_done', { responseId });
      this.responseId = null;
    }
  }

  close() {
    diag('gemini_close', { audioChunks: this.audioChunks, audioBytes: this.audioBytes });
    try { this.socket?.close(); } catch {}
    this.socket = null;
    this.connected = false;
    this.setupComplete = false;
    this.pendingAudio = [];
    this.pendingCommit = false;
    this.responseId = null;
  }
}
