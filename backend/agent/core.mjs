import { randomUUID } from 'node:crypto';
import { listAuroraCapabilities } from '../providers/huggingface-capabilities.mjs';

const SYSTEM_PROMPT = `You are Aurora, the intelligent agent of Aura System.
You are the orchestration layer for Aura System. Use authorized Aura actions and Hugging Face capabilities instead of inventing action JSON in normal text.
Select the most appropriate Hugging Face capability/model for the requested operation when one is available.
Never claim an external Aura action or model inference succeeded unless the tool result confirms it.
Keep the user-facing response concise while preserving important failures and limitations.`;

const AURORA_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'aura_action',
      description: 'Dispatch an authorized operation to Aura System. Use this for avatar, scene, memory, voice, animation, clothing, media, project, game, automation, settings, integration, or system operations.',
      parameters: {
        type: 'object',
        properties: {
          domain: { type: 'string', enum: ['avatar', 'scene', 'memory', 'voice', 'animation', 'clothing', 'media', 'project', 'game', 'automation', 'settings', 'integration', 'system'] },
          action: { type: 'string' },
          args: { type: 'object', additionalProperties: true },
        },
        required: ['domain', 'action', 'args'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hf_capability',
      description: 'Run a Hugging Face capability through the provider adapter. A model may be selected explicitly when the user or task requires it.',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', enum: listAuroraCapabilities().map(({ task }) => task) },
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

export function createAuroraCore({ provider, auraBridge = null }) {
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

      if (name === 'aura_action' && input.domain && input.action && typeof input.args === 'object') {
        try {
          const result = auraBridge ? await auraBridge.dispatch({ domain: input.domain, action: input.action, args: input.args, signal }) : { ok: false, dispatched: false, reason: 'Aura bridge is not configured.' };
          const action = { id: randomUUID(), domain: input.domain, action: input.action, args: input.args, result: summarizeToolResult(result) };
          actions.push(action);
          toolResults.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
        } catch (error) {
          toolResults.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: false, domain: input.domain, action: input.action, error: error instanceof Error ? error.message : 'Unknown error' }) });
        }
        continue;
      }

      if (name === 'hf_capability' && input.task && typeof input.args === 'object') {
        try {
          const result = await provider.runTask(input.task, input.args, { model: input.model, signal });
          const summary = summarizeToolResult(result);
          toolResults.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: true, task: input.task, model: input.model ?? null, result: summary }) });
        } catch (error) {
          toolResults.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: false, task: input.task, model: input.model ?? null, error: error instanceof Error ? error.message : 'Unknown error' }) });
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

    return { sessionId, provider: provider.name, model: provider.model, message: finalMessage, actions, finishReason, tools: toolResults.length };
  }

  return { handleMessage };
}
