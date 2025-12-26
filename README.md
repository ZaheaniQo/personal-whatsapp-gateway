# Personal WhatsApp Gateway

## Ops Persistence
- `OPS_DB_PATH` (optional): path to the SQLite database used for operational state and logs.
  - Default: `/data/ops.sqlite`
  - Fallback: `./data/ops.sqlite` if `/data` is not writable.

## Ops APIs
- `GET /ops/status` -> current status snapshot (auth required)
- `GET /ops/instances` -> list instances (auth required)
- `GET /ops/logs?limit=200&type=send|error|system` -> persisted logs (auth required)
- `GET /ops/events` -> SSE stream for status/qr/log updates (auth required)

## Media Pipeline
Environment:
- `MAX_UPLOAD_MB` (default: 20)
- `UPLOAD_DIR` (default: `/data/uploads`)
- `ALLOW_URL_DOWNLOADS` (default: false)
- `URL_MAX_MB` (default: 20)

Endpoints (auth required):
- `POST /media/upload` (multipart form-data: file, caption?, number?)
- `POST /media/send` (JSON: number, fileId|path|url, caption?)
