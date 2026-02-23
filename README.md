# pot-api

REST API server for [pot-sdk](https://npmjs.com/package/pot-sdk) — sync and async AI output verification with webhook callbacks.

## What it does

pot-api wraps pot-sdk as an HTTP server. Fire a verification request and get the result synchronously, or use async mode to get a `jobId` immediately while verification runs in the background — with optional webhook push on completion.

## Install & Run

```bash
# Run directly
ANTHROPIC_API_KEY=... XAI_API_KEY=... npx pot-api

# Or install globally
npm install -g pot-api
pot-api
```

Default port: `3141`. Override with `PORT=8080`.

## Endpoints

### `POST /verify` — Sync
Blocks until verification is complete (~5–30s depending on tier).

```bash
curl -X POST http://localhost:3141/verify \
  -H "Content-Type: application/json" \
  -d '{
    "output": "The Eiffel Tower is 330m tall.",
    "question": "How tall is the Eiffel Tower?",
    "tier": "basic"
  }'
```

Returns: `VerificationResult` (confidence, flags, mdi, sas, dissent, synthesis)

### `POST /verify/async` — Async + Webhook
Returns `{jobId}` immediately. Verification runs in background.

```bash
curl -X POST http://localhost:3141/verify/async \
  -H "Content-Type: application/json" \
  -d '{
    "output": "The Eiffel Tower is 330m tall.",
    "question": "How tall is the Eiffel Tower?",
    "tier": "basic",
    "callbackUrl": "https://your-agent.example.com/webhook"
  }'

# → {"jobId":"abc-123","status":"pending","pollUrl":"/jobs/abc-123"}
```

When done, pot-api POSTs to your `callbackUrl`:
```json
{
  "jobId": "abc-123",
  "status": "done",
  "result": { "verified": true, "confidence": 0.91, ... }
}
```

### `GET /jobs/:id` — Poll Status
```bash
curl http://localhost:3141/jobs/abc-123
# → {"id":"abc-123","status":"running","input":{...}}
# → {"id":"abc-123","status":"done","result":{...}}
```

Status values: `pending` → `running` → `done` | `error`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | ✅ Required |
| `XAI_API_KEY` | Optional extra generator |
| `DEEPSEEK_API_KEY` | Optional extra generator |
| `MOONSHOT_API_KEY` | Optional extra generator |
| `PORT` | Server port (default: 3141) |

## Per-request API keys (BYOK)

Override keys per request:
```json
{
  "output": "...",
  "question": "...",
  "apiKeys": {
    "anthropic": "sk-ant-...",
    "xai": "xai-..."
  }
}
```

## Links

- pot-sdk: https://npmjs.com/package/pot-sdk
- pot-mcp: https://npmjs.com/package/pot-mcp
- Protocol spec: https://thoughtproof.ai
- GitHub: https://github.com/ThoughtProof/pot-api
