import { randomUUID } from 'node:crypto';

const SYSTEM_PROMPT = `You are Aurora, the intelligent agent of Aura System.
You are a helpful, warm, concise AI companion. You can reason about the Aura System and its 3D avatar.
When an action is needed, use the available tools instead of inventing action JSON in normal text.
Never claim an external action succeeded unless the tool system confirms it.`;

const AURORA_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'avatar_action',
      description: 'Request an authorized action for Aurora\'s 3D avatar.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['look', 'walk', 'sit', 'gesture', 'speak', 'setOutfit', 'setExpression'],
          },
          args: { type: 'object', additionalProperties: true },
        },
        required: ['action', 'args'],
        additionalProperties: false,
      },
    },
  },
];

export function createAuroraCore({ provider }) {
  const sessions = new Map();

  function getSession(sessionId) {
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, [{ role: 'system', content: SYSTEM_PROMPT }]);
    }
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
    const toolCalls = assistantMessage.tool_calls ?? [];

    for (const call of toolCalls) {
      if (call?.function?.name !== 'avatar_action') continue;
      let input;
      try {
        input = JSON.parse(call.function.arguments || '{}');
      } catch {
        continue;
      }
      if (!input.action || typeof input.args !== 'object') continue;
      actions.push({ id: randomUUID(), action: input.action, args: input.args });
    }

    history.push({
      role: 'assistant',
      content: assistantMessage.content ?? '',
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    });

    return {
      sessionId,
      provider: provider.name,
      model: provider.model,
      message: assistantMessage.content ?? '',
      actions,
      finishReason: choice?.finish_reason ?? null,
    };
  }

  return { handleMessage };
}
