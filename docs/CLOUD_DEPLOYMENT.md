# Aurora cloud deployment

Aurora is designed so the home computer is a development machine, not the production server.

## Target architecture

```text
GitHub (source)
      |
      | automatic deploy from main
      v
Cloud Web Service
  ├── PlayCanvas web client
  ├── Aurora Node.js API
  ├── Hugging Face provider
  └── future memory / voice / tools
      |
      v
Phone / tablet / computer browser
```

The first deployment blueprint is `render.yaml`. It creates one Node web service so the web client and API share one HTTPS origin and one URL.

## Secrets

Do not commit real credentials. The Render blueprint marks `HF_TOKEN` as a secret input (`sync: false`). Add its value in the Render service environment settings when the service is created.

Keep local development secrets in `.env`; `.gitignore` already excludes `.env` and `.env.*` while allowing `.env.example`.

## Deployment

1. Create a Render account and connect the GitHub account that owns `SkelleTu/Aurora-Agent`.
2. Create a Blueprint from the repository, using `render.yaml`.
3. When Render asks for the secret value, enter the Hugging Face token directly in Render. Never paste it into chat or GitHub files.
4. Render builds with `npm install && npm run build` and starts `node backend/server.mjs`.
5. The service health check is `/health`.
6. Open the generated HTTPS service URL from the phone or tablet. No home computer needs to remain powered on.

Render supports automatic deployment when new commits land on the selected branch. Its free web services can sleep after inactivity, so the free plan is suitable for development/testing but is not an always-warm production setup.

## Important next production layers

Before making Aurora broadly accessible, add authentication and persistent storage. The current session history is process-local memory, so a restart/deploy loses active sessions. Persistent memory should move to a managed database, and user authentication should protect the private Aura System interface and APIs.
