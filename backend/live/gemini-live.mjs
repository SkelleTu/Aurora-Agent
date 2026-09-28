import { GoogleGenAI, Modality } from '@google/genai';
import { RealtimeModelAdapter } from './model-adapter.mjs';
import { LIVE_AURA_TOOL } from './tools.mjs';

export class GeminiLiveAdapter extends RealtimeModelAdapter {
  constructor({ apiKey, model = 'gemini-3.8-live', language = 'pt-BR', auraBridge }) {
    super();
    if (!apiKey) throw new Error('GOOGLE_API_KEY is required for Gemini Live.');
    this.apiKey = apiKey;
    this.model = model;
    this.language = language;
    this.auraBridge = auraBridge;
    this.ai = new GoogleGenAI({ apiKey });
    this.session = null;
    this.responseId = null;
  }

  async connect() {
    const declaration = LIVE_AURA_TOOL.function;
    this.session = await this.ai.live.connect({
      model: this.model,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: { parts: [{ text: `Você é Aurora, o agente de voz do Aura System. Responda naturalmente em ${this.language}. Seja concisa e conversacional. Você pode controlar o Aura System usando a ferramenta aura_action.` }] },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: { automaticActivityDetection: { disabled: false, prefixPaddingMs: 120, silenceDurationMs: 420 } },
        tools: [{ functionDeclarations: [declaration] }],
      },
      callbacks: {
        onopen: () => this.emit('connected', { model: this.model }),
        onmessage: (message) => void this.handleMessage(message),
        onerror: (error) => this.emit('error', { error: error?.message || String(error) }),
        onclose: (event) => this.emit('closed', { reason: event?.reason || '' }),
      },
    });
    return this;
  }

  sendAudio(buffer) {
    if (!this.session || !buffer?.length) return;
    this.session.sendRealtimeInput({ audio: { data: Buffer.from(buffer).toString('base64'), mimeType: 'audio/pcm;rate=16000' } });
  }

  commitInput() { this.session?.sendRealtimeInput({ audioStreamEnd: true }); }

  interrupt() {
    if (!this.session) return;
    try { this.session.sendRealtimeInput({ activityStart: {} }); } catch {}
    this.emit('audio_interrupted', {});
  }

  async sendToolResponse(functionResponses) {
    if (this.session) this.session.sendToolResponse({ functionResponses });
  }

  async handleMessage(message) {
    const content = message?.serverContent;
    if (content?.inputTranscription?.text) this.emit('input_transcript_delta', { text: content.inputTranscription.text });
    if (content?.outputTranscription?.text) this.emit('output_transcript_delta', { text: content.outputTranscription.text });

    if (content?.modelTurn?.parts) {
      for (const part of content.modelTurn.parts) {
        if (part?.inlineData?.data) {
          const responseId = this.responseId || crypto.randomUUID();
          this.responseId = responseId;
          this.emit('response_created', { responseId, model: this.model });
          this.emit('audio_delta', { responseId, data: Buffer.from(part.inlineData.data, 'base64'), sampleRate: 24000, channels: 1, encoding: 'pcm_s16le' });
        }
        if (part?.text) this.emit('output_text_delta', { text: part.text });
      }
    }

    if (message?.toolCall?.functionCalls?.length) {
      const responses = [];
      for (const call of message.toolCall.functionCalls) {
        if (call.name !== 'aura_action') {
          responses.push({ id: call.id, name: call.name, response: { error: 'unknown_tool' } });
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
        responses.push({ id: call.id, name: call.name, response: { result } });
      }
      await this.sendToolResponse(responses);
    }

    if (content?.interrupted) this.emit('audio_interrupted', { responseId: this.responseId });
    if (content?.turnComplete) {
      const responseId = this.responseId;
      this.emit('audio_done', { responseId });
      this.emit('response_done', { responseId });
      this.responseId = null;
    }
  }

  close() {
    try { this.session?.close(); } catch {}
    this.session = null;
    this.responseId = null;
  }
}
