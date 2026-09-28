export const HUGGING_FACE_TASKS = {
  reasoning: 'chatCompletion',
  vision: 'chatCompletion',
  embeddings: 'featureExtraction',
  semanticSimilarity: 'sentenceSimilarity',
  textGeneration: 'textGeneration',
  translation: 'translation',
  classification: 'textClassification',
  zeroShotClassification: 'zeroShotClassification',
  entityExtraction: 'tokenClassification',
  speechToText: 'automaticSpeechRecognition',
  textToSpeech: 'textToSpeech',
  textToAudio: 'textToAudio',
  imageUnderstanding: 'imageToText',
  imageQuestionAnswering: 'visualQuestionAnswering',
  imageClassification: 'imageClassification',
  objectDetection: 'objectDetection',
  imageSegmentation: 'imageSegmentation',
  textToImage: 'textToImage',
  imageToImage: 'imageToImage',
  textToVideo: 'textToVideo',
  imageToVideo: 'imageToVideo',
  imageTextToImage: 'imageTextToImage',
  imageTextToVideo: 'imageTextToVideo',
};

export const AURORA_MODEL_PROFILES = {
  reasoning: process.env.HF_REASONING_MODEL || process.env.HF_MODEL || 'openai/gpt-oss-120b:fastest',
  vision: process.env.HF_VISION_MODEL || 'Qwen/Qwen2.5-VL-7B-Instruct',
  embeddings: process.env.HF_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
  speechToText: process.env.HF_STT_MODEL || 'openai/whisper-large-v3',
  textToSpeech: process.env.HF_TTS_MODEL || 'espnet/kan-bayashi_ljspeech_vits',
  textToImage: process.env.HF_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell',
  textToVideo: process.env.HF_VIDEO_MODEL || 'Lightricks/LTX-Video',
};

export function resolveAuroraTask(task) {
  const method = HUGGING_FACE_TASKS[task];
  if (!method) throw new Error(`Unsupported Hugging Face task: ${task}`);
  return { task, method, model: AURORA_MODEL_PROFILES[task] || null };
}
