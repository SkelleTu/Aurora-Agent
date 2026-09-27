const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-5.6-luna';

export function createOpenAIProvider(config = {}) {
  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
  const baseUrl = (config.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const model = config.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

  return {
    name: 'openai',
    model,
    configured: Boolean(apiKey),
    async chat({ messages, temperature = 0.7, maxTokens = 1024, tools, signal } = {}) {
      if (!apiKey) throw new Error('OPENAI_API_KEY is required to use the OpenAI provider.');
      const body = { model, messages, temperature, max_tokens: maxTokens };
      if (tools?.length) body.tools = tools;

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`OpenAI request failed (${response.status}): ${detail}`);
      }
      return response.json();
    },
  };
}
