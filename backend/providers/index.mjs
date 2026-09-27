import { createHuggingFaceProvider } from './huggingface.mjs';

export function createAIProvider() {
  const provider = process.env.AURORA_AI_PROVIDER ?? 'huggingface';

  if (provider === 'huggingface') return createHuggingFaceProvider();

  throw new Error(`Unsupported AURORA_AI_PROVIDER: ${provider}`);
}

export { createHuggingFaceProvider };
