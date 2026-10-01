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
      description: 'Dispatch an authorized operation to Aura System. Use this for avatar, scene, memory, voice, animation, clothing, media, project, game, automation, settings, integration, integratesystem, interface, or system operations.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Destination platform/system identifier, for example aura or another registered integration target.' },
          domain: { type: 'string', description: 'Destination-specific operation domain.' },
          action: { type: 'string', description: 'Destination-specific operation name.' },
          args: { type: 'object', additionalProperties: true },
        },
        required: ['target', 'domain', 'action', 'args'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aura_inspect',
      description: 'Inspect Aura System health, capabilities, or Aurora diagnostic traces before or after an operation.',
      parameters: {
        type: 'object',
        properties: {
          operation: { type: 'string', enum: ['health', 'capabilities', 'diagnostics', 'diagnostic_trace'] },
          traceId: { type: 'string' },
        },
        required: ['operation'],
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
  const maxToolRounds = 8;

  function getSession(sessionId) {
    if (!sessions.has(sessionId)) sessions.set(sessionId, [{ role: 'system', content: SYSTEM_PROMPT }]);
    return sessions.get(sessionId);
  }

  async function executeToolCall(call, signal) {
    const name = call?.function?.name;
    let input;
    try { input = JSON.parse(call?.function?.arguments || '{}'); } catch {
      return { role: 'tool', tool_call_id: call?.id, content: JSON.stringify({ ok: false, error: 'invalid_tool_arguments' }) };
    }

    if (name === 'aura_action' && input.target && input.domain && input.action && typeof input.args === 'object') {
      try {
        const result = auraBridge
          ? await auraBridge.dispatch({ target: input.target, domain: input.domain, action: input.action, args: input.args, signal })
          : { ok: false, dispatched: false, reason: 'Aura bridge is not configured.' };
        return {
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
          action: { id: randomUUID(), target: input.target, domain: input.domain, action: input.action, args: input.args, result: summarizeToolResult(result) },
        };
      } catch (error) {
        return {
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ ok: false, domain: input.domain, action: input.action, error: error instanceof Error ? error.message : 'Unknown error' }),
        };
      }
    }

    if (name === 'aura_inspect' && input.operation) {
      try {
        let result;
        if (input.operation === 'health') result = auraBridge ? await auraBridge.health(signal) : { ok: false, reason: 'Aura bridge is not configured.' };
        else if (input.operation === 'capabilities') result = auraBridge ? await auraBridge.capabilities(signal) : { ok: false, reason: 'Aura bridge is not configured.' };
        else if (input.operation === 'diagnostics') result = auraBridge ? await auraBridge.diagnostics(undefined, signal) : { ok: false, reason: 'Aura bridge is not configured.' };
        else result = auraBridge ? await auraBridge.diagnostics(input.traceId, signal) : { ok: false, reason: 'Aura bridge is not configured.' };
        return { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) };
      } catch (error) {
        return { role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: false, operation: input.operation, error: error instanceof Error ? error.message : 'Unknown error' }) };
      }
    }

    if (name === 'hf_capability' && input.task && typeof input.args === 'object') {
      try {
        const result = await provider.runTask(input.task, input.args, { model: input.model, signal });
        return {
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ ok: true, task: input.task, model: input.model ?? null, result: summarizeToolResult(result) }),
        };
      } catch (error) {
        return {
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ ok: false, task: input.task, model: input.model ?? null, error: error instanceof Error ? error.message : 'Unknown error' }),
        };
      }
    }

    return { role: 'tool', tool_call_id: call?.id, content: JSON.stringify({ ok: false, error: `Unknown or invalid tool: ${name || 'unknown'}` }) };
  }

  async function handleMessage({ sessionId = randomUUID(), message, signal } = {}) {
    if (!message?.trim()) throw new Error('message is required');
    const history = getSession(sessionId);
    history.push({ role: 'user', content: message.trim() });

    let response = await provider.chat({ messages: history, tools: AURORA_TOOLS, signal });
    let choice = response?.choices?.[0];
    let assistantMessage = choice?.message;
    if (!assistantMessage) throw new Error('Model returned no assistant message.');

    const actions = [];
    let toolCount = 0;
    let finishReason = choice?.finish_reason ?? null;

    for (let round = 0; round < maxToolRounds; round += 1) {
      const toolCalls = assistantMessage.tool_calls ?? [];
      history.push({ role: 'assistant', content: assistantMessage.content ?? '', ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });

      if (!toolCalls.length) break;

      const toolResults = [];
      for (const call of toolCalls) {
        const result = await executeToolCall(call, signal);
        toolCount += 1;
        if (result.action) {
          actions.push(result.action);
          delete result.action;
        }
        toolResults.push(result);
      }
      history.push(...toolResults);

      response = await provider.chat({ messages: history, tools: AURORA_TOOLS, signal });
      choice = response?.choices?.[0];
      assistantMessage = choice?.message;
      if (!assistantMessage) throw new Error('Model returned no follow-up message.');
      finishReason = choice?.finish_reason ?? finishReason;
    }

    const finalMessage = assistantMessage.content ?? '';
    history.push({ role: 'assistant', content: finalMessage });
    return { sessionId, provider: provider.name, model: provider.model, message: finalMessage, actions, finishReason, tools: toolCount };
  }

  return { handleMessage };
}
