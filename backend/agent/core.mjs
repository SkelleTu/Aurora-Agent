import { randomUUID } from 'node:crypto';

const SYSTEM_PROMPT = `You are Aurora, the intelligent agent of Aura System.
You are a helpful, warm, concise AI companion and the orchestration layer for Aura System.
Use authorized tools for Aura System actions and Hugging Face capabilities instead of inventing action JSON in normal text.
Never claim an external action succeeded unless the tool result confirms it.`;

const AURORA_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'avatar_action',
      description: 'Request an authorized action for Aurora\'s 3D avatar.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['look', 'walk', 'sit', 'gesture', 'speak', 'setOutfit', 'setExpression'] },
          args: { type: 'object', additionalProperties: true },
        },
        required: ['action', 'args'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hf_capability',
      description: 'Use a Hugging Face model selected by Aurora capability, such as vision, embeddings, speechToText, textToSpeech, textToImage or textToVideo.',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', enum: ['reasoning', 'vision', 'embeddings', 'semanticSimilarity', 'textGeneration', 'translation', 'classification', 'zeroShotClassification', 'entityExtraction', 'speechToText', 'textToSpeech', 'textToAudio', 'imageUnderstanding', 'imageQuestionAnswering', 'imageClassification', 'objectDetection', 'imageSegmentation', 'textToImage', 'imageToImage', 'textToVideo', 'imageToVideo', 'imageTextToImage', 'imageTextToVideo'] },
          args: { type: 'object', additionalProperties: true },
          model: { type: 'string' },
        },
        required: ['task', 'args'],
        additionalProperties: false,
      },
    },
  },
];

function summarizeToolResult(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value.slice(0, 4000);
  if (value instanceof Blob) return { type: 'binary', contentType: value.type, size: value.size };
  try { return JSON.parse(JSON.stringify(value)); } catch { return { type: typeof value }; }
}

export function createAuroraCore({ provider }) {
  const sessions = new Map();

  function getSession(sessionId) {
    if (!sessions.has(sessionId)) sessions.set(sessionId, [{ role: 'system', content: SYSTEM_PROMPT }]);
    return sessions.get(sessionId);
  }

  async function handleMessage({ sessionId = randomUUID(), message, signal } = {}) {
    if (!message?.trim()) throw new Error('message is required');
    const history = getSession(sessionId);
    history.push({ role: 'user', content: message.trim() });

    const first = await provider.chat({ messages: history, tools: AURORA_TOOLS, signal });
    const choice = first?.choices?.[0];
    const assistantMessage = choice?.message;
    if (!assistantMessage) throw new Error('Model returned no assistant message.');

    const actions = [];
    const toolResults = [];
    const toolCalls = assistantMessage.tool_calls ?? [];

    history.push({ role: 'assistant', content: assistantMessage.content ?? '', ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });

    for (const call of toolCalls) {
      const name = call?.function?.name;
      let input;
      try { input = JSON.parse(call.function.arguments || '{}'); } catch { continue; }

      if (name === 'avatar_action' && input.action && typeof input.args === 'object') {
        const action = { id: randomUUID(), action: input.action, args: input.args };
        actions.push(action);
        toolResults.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: true, action }) });
        continue;
      }

      if (name === 'hf_capability' && input.task && typeof input.args === 'object') {
        try {
          const result = await provider.runTask(input.task, input.args, { model: input.model });
          const summary = summarizeToolResult(result);
          toolResults.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: true, task: input.task, model: input.model ?? null, result: summary }) });
        } catch (error) {
          toolResults.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: false, task: input.task, error: error instanceof Error ? error.message : 'Unknown error' }) });
        }
      }
    }

    let finalMessage = assistantMessage.content ?? '';
    let finishReason = choice?.finish_reason ?? null;

    if (toolResults.length) {
      history.push(...toolResults);
      const followup = await provider.chat({ messages: history, tools: AURORA_TOOLS, signal });
      const followupMessage = followup?.choices?.[0]?.message;
      if (followupMessage) {
        finalMessage = followupMessage.content ?? finalMessage;
        finishReason = followup?.choices?.[0]?.finish_reason ?? finishReason;
        history.push({ role: 'assistant', content: finalMessage });
      }
    }

    return {
      sessionId,
      provider: provider.name,
      model: provider.model,
      message: finalMessage,
      actions,
      finishReason,
      tools: toolResults.length,
    };
  }

  return { handleMessage };
}
