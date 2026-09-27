const DEFAULT_BASE_URL = 'https://router.huggingface.co/v1';
const DEFAULT_MODEL = 'openai/gpt-oss-120b:fastest';

export function createHuggingFaceProvider(config = {}) {
  const apiKey = config.apiKey ?? process.env.HF_TOKEN;
  const baseUrl = (config.baseUrl ?? process.env.HF_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const model = config.model ?? process.env.HF_MODEL ?? DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error('HF_TOKEN is required to use the Hugging Face provider.');
  }

  return {
    name: 'huggingface',
    model,
    async chat({ messages, temperature = 0.7, maxTokens = 1024, tools, signal } = {}) {
      const body = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      };

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
        throw new Error(`Hugging Face request failed (${response.status}): ${detail}`);
      }

      return response.json();
    },
  };
}
