# Hugging Face setup for Aurora

## Server environment

Add these variables to the Aurora backend environment (never to browser code or committed secrets):

```env
AI_PROVIDER=huggingface
HF_TOKEN=your_token_here
HF_BASE_URL=https://router.huggingface.co/v1
HF_MODEL=openai/gpt-oss-120b:fastest
```

The provider adapter lives at `backend/providers/huggingface.mjs`.

## Why the router

The Hugging Face router exposes an OpenAI-compatible chat-completions interface and can route a selected model through supported inference providers. Aurora can therefore keep one provider interface while changing the model or provider policy through configuration.

Useful policies include:

- `:fastest` for throughput-focused experiments.
- `:cheapest` for cost-focused experiments.
- `:preferred` for the provider order configured in Hugging Face.
- `:provider-name` when a specific provider is required.

## Recommended first experiment

Start with `openai/gpt-oss-120b:fastest` as a benchmark candidate. Compare it against a smaller model such as `openai/gpt-oss-20b` and selected Qwen conversational models before declaring a production default.

Measure:

1. First-token latency.
2. Tokens/second.
3. Portuguese conversational quality.
4. Long-context consistency.
5. Tool/function calling reliability.
6. Structured action output reliability.
7. Cost per conversation.

Aurora's core must not depend on any one of these models.
