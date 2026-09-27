# AI provider strategy

## Hugging Face first integration

Aurora uses a provider adapter so the agent core does not depend on a specific model vendor.

The first production-ready integration target is Hugging Face Inference Providers because it offers an OpenAI-compatible chat API, multiple inference providers behind one routing layer, streaming/tool-oriented agent capabilities, and model/provider selection without changing Aurora's core contract.

### Initial model candidates

- `openai/gpt-oss-120b` — candidate for the high-capability Aurora profile; supports tool calling and structured/agentic workflows through Hugging Face Inference Providers.
- `openai/gpt-oss-20b` — candidate for lower-cost or latency-sensitive experiments.
- Qwen conversational models — candidates for comparison testing, especially when long context or specialized reasoning/coding behavior is needed.
- Other Hugging Face chat-completion models can be substituted through configuration.

These are candidates, not a permanent model choice. Benchmark before selecting the default production model.

### Provider selection

Hugging Face supports automatic routing policies such as `:fastest`, `:cheapest`, and `:preferred`, or explicit providers. Aurora should keep this decision in configuration rather than application logic.

Example:

```env
AI_PROVIDER=huggingface
HF_MODEL=openai/gpt-oss-120b:fastest
HF_TOKEN=replace_me
```

### Architecture

```text
Aurora Core
    |
    v
AI Provider Interface
    |
    +--> Hugging Face Router
    |       |
    |       +--> Provider A
    |       +--> Provider B
    |       +--> Provider C
    |
    +--> Future direct provider
    +--> Future self-hosted model
```

The avatar, memory, voice, PlayCanvas runtime, tool registry and Aura System integration must never depend on a specific model identifier.

## Cost and deployment note

Hugging Face Inference Providers are pay-as-you-go and use provider infrastructure. Dedicated Inference Endpoints are a separate option when Aurora later needs a dedicated model deployment and more control over runtime infrastructure. Do not deploy a dedicated GPU permanently until benchmarks justify the cost.

## Security

Never commit `HF_TOKEN` or any provider secret. Tokens belong in the server environment only. The browser communicates with Aurora's backend, not directly with the Hugging Face token.
