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
  semanticSimilarity: process.env.HF_SIMILARITY_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
  textGeneration: process.env.HF_TEXT_GENERATION_MODEL || 'HuggingFaceTB/SmolLM3-3B',
  translation: process.env.HF_TRANSLATION_MODEL || 'Helsinki-NLP/opus-mt-en-fr',
  classification: process.env.HF_CLASSIFICATION_MODEL || 'distilbert/distilbert-base-uncased-finetuned-sst-2-english',
  zeroShotClassification: process.env.HF_ZERO_SHOT_MODEL || 'facebook/bart-large-mnli',
  entityExtraction: process.env.HF_ENTITY_MODEL || 'dslim/bert-base-NER',
  speechToText: process.env.HF_STT_MODEL || 'openai/whisper-large-v3',
  textToSpeech: process.env.HF_TTS_MODEL || 'espnet/kan-bayashi_ljspeech_vits',
  textToAudio: process.env.HF_AUDIO_MODEL || 'facebook/musicgen-small',
  imageUnderstanding: process.env.HF_IMAGE_UNDERSTANDING_MODEL || 'Salesforce/blip-image-captioning-base',
  imageQuestionAnswering: process.env.HF_VQA_MODEL || 'dandelin/vilt-b32-finetuned-vqa',
  imageClassification: process.env.HF_IMAGE_CLASSIFICATION_MODEL || 'google/vit-base-patch16-224',
  objectDetection: process.env.HF_OBJECT_DETECTION_MODEL || 'facebook/detr-resnet-50',
  imageSegmentation: process.env.HF_SEGMENTATION_MODEL || 'facebook/mask2former-swin-small-coco-panoptic',
  textToImage: process.env.HF_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell',
  imageToImage: process.env.HF_IMAGE_TO_IMAGE_MODEL || 'timbrooks/instruct-pix2pix',
  textToVideo: process.env.HF_VIDEO_MODEL || 'Lightricks/LTX-Video',
  imageToVideo: process.env.HF_IMAGE_TO_VIDEO_MODEL || 'Lightricks/LTX-Video',
  imageTextToImage: process.env.HF_IMAGE_TEXT_TO_IMAGE_MODEL || 'Qwen/Qwen2.5-VL-7B-Instruct',
  imageTextToVideo: process.env.HF_IMAGE_TEXT_TO_VIDEO_MODEL || 'Lightricks/LTX-Video',
};

export const AURORA_CAPABILITY_GROUPS = {
  cognition: ['reasoning', 'vision', 'embeddings', 'semanticSimilarity', 'textGeneration', 'translation', 'classification', 'zeroShotClassification', 'entityExtraction'],
  audio: ['speechToText', 'textToSpeech', 'textToAudio'],
  vision: ['imageUnderstanding', 'imageQuestionAnswering', 'imageClassification', 'objectDetection', 'imageSegmentation'],
  creation: ['textToImage', 'imageToImage', 'textToVideo', 'imageToVideo', 'imageTextToImage', 'imageTextToVideo'],
};

export function resolveAuroraTask(task) {
  const method = HUGGING_FACE_TASKS[task];
  if (!method) throw new Error(`Unsupported Hugging Face task: ${task}`);
  return { task, method, model: AURORA_MODEL_PROFILES[task] || null };
}

export function listAuroraCapabilities() {
  return Object.entries(HUGGING_FACE_TASKS).map(([task, method]) => ({
    task,
    method,
    model: AURORA_MODEL_PROFILES[task] || null,
    group: Object.entries(AURORA_CAPABILITY_GROUPS).find(([, tasks]) => tasks.includes(task))?.[0] || 'other',
  }));
}
