import { InferenceClient } from '@huggingface/inference';
import { AURORA_MODEL_PROFILES, resolveAuroraTask } from './huggingface-capabilities.mjs';

const DEFAULT_BASE_URL = 'https://router.huggingface.co/v1';
const DEFAULT_MODEL = 'openai/gpt-oss-120b:fastest';

async function readJsonResponse(response, label) {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${label} failed (${response.status}): ${detail}`);
  }
  return response.json();
}

export function createHuggingFaceProvider(config = {}) {
  const apiKey = config.apiKey ?? process.env.HF_TOKEN;
  const baseUrl = (config.baseUrl ?? process.env.HF_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const model = config.model ?? process.env.HF_MODEL ?? DEFAULT_MODEL;
  const client = apiKey ? new InferenceClient(apiKey) : null;

  if (!apiKey) throw new Error('HF_TOKEN is required to use the Hugging Face provider.');

  return {
    name: 'huggingface',
    model,
    profiles: AURORA_MODEL_PROFILES,

    async chat({ messages, temperature = 0.7, maxTokens = 1024, tools, signal, model: requestedModel } = {}) {
      const body = {
        model: requestedModel ?? model,
        messages,
        temperature,
        max_tokens: maxTokens,
      };
      if (tools?.length) body.tools = tools;

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      return readJsonResponse(response, 'Hugging Face request');
    },

    async runTask(task, args = {}, options = {}) {
      if (!client) throw new Error('HF_TOKEN is required for Hugging Face tasks.');
      const { method, model: profileModel } = resolveAuroraTask(task);
      const selectedModel = options.model ?? profileModel ?? model;
      if (typeof client[method] !== 'function') throw new Error(`Hugging Face task method is unavailable: ${method}`);
      return client[method]({ ...args, model: selectedModel }, options.providerOptions);
    },

    async listChatModels() {
      return readJsonResponse(
        await fetch(`${baseUrl}/models`, { headers: { authorization: `Bearer ${apiKey}` }),
        'Hugging Face model catalog',
      );
    },

    async listHubModels({ task, provider = 'all', limit = 100, author } = {}) {
      const url = new URL('https://huggingface.co/api/models');
      url.searchParams.set('inference_provider', provider);
      url.searchParams.set('limit', String(Math.min(Number(limit) || 100, 500)));
      url.searchParams.set('sort', 'lastModified');
      url.searchParams.set('direction', '-1');
      if (task) url.searchParams.set('pipeline_tag', task);
      if (author) url.searchParams.set('author', author);
      return readJsonResponse(
        await fetch(url, { headers: { authorization: `Bearer ${apiKey}` } }),
        'Hugging Face Hub catalog',
      );
    },

    async whoAmI() {
      return readJsonResponse(
        await fetch('https://huggingface.co/api/whoami-v2', { headers: { authorization: `Bearer ${apiKey}` } }),
        'Hugging Face identity lookup',
      );
    },

    async listAccessibleModels({ task, provider = 'all', limit = 500 } = {}) {
      const identity = await this.whoAmI();
      const author = identity?.name || identity?.fullname || identity?.user?.name;
      const models = await this.listHubModels({ task, provider, limit, author });
      return {
        owner: author || null,
        models,
        count: Array.isArray(models) ? models.length : 0,
      };
    },
  };
}
