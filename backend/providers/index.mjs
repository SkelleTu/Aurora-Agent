import { createHuggingFaceProvider } from './huggingface.mjs';
import { createOpenAIProvider } from './openai.mjs';

export function createAIProvider() {
  const provider = process.env.AURORA_AI_PROVIDER ?? 'openai';

  if (provider === 'openai') return createOpenAIProvider();
  if (provider === 'huggingface') return createHuggingFaceProvider();

  throw new Error(`Unsupported AURORA_AI_PROVIDER: ${provider}`);
}

export { createHuggingFaceProvider, createOpenAIProvider };
