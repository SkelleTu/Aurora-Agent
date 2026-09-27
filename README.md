# Aurora Agent

Aurora is the intelligent agent layer for the future Aura System: a browser-based 3D AI companion platform built independently from the Clamour game projects.

## Vision

Aurora will eventually orchestrate conversation, voice, persistent memory, personality, 3D presence, avatar state, animation, gaze, clothing, accessories, and authorized integrations through a single agent protocol.

## Architecture

- `apps/web` — standalone PlayCanvas Engine + TypeScript/Vite client
- `backend` — Node.js API boundary for AI, memory, sessions and integrations
- `packages/protocol` — shared agent events/actions contract
- `.env.example` — configuration template; secrets never belong in source control

## Principles

1. Aurora-Agent is independent from the game repositories.
2. PlayCanvas Engine is used as an engine, not as a dependency on the PlayCanvas Editor project.
3. Provider integrations stay behind adapters so models, STT and TTS can be replaced.
4. Avatar assets remain modular: body, face, hair, clothing, shoes and accessories.
5. The agent can only perform external/system actions through explicit, authorized tools.

## Development

```bash
npm install
npm run dev
```

The initial scaffold provides a web shell and a health endpoint. AI, voice and 3D avatar providers are intentionally adapter-based and can be connected as the platform evolves.
