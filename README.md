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

## Campaign Platform
Environment:
- `JWT_SECRET` (required): secret for JWT signing
- `JWT_EXPIRES_IN` (default: `6h`)
- `APP_DB_PATH` (optional): SQLite database for auth/instances/campaigns
- `SESSIONS_DIR` (optional): base directory for WhatsApp instance sessions
- `SEND_DELAY_MS` (default: 1200)
- `ADMIN_BOOTSTRAP_MOBILE` / `ADMIN_BOOTSTRAP_PASSWORD` (one-time bootstrap)

All new `/app/*` APIs require JWT `Authorization: Bearer <token>`. Legacy APIs remain protected by the existing `x-api-key` header and IP allowlist.

## EC2 + PM2 Runbook
1) Install Node.js 18+, Chrome/Chromium, and PM2:
   - `sudo apt-get update && sudo apt-get install -y chromium-browser`
   - `npm install -g pm2`
2) Create data directories:
   - `sudo mkdir -p /data/.wwebjs_auth /data/uploads`
   - `sudo chown -R $USER:$USER /data`
3) Configure environment:
   - Copy `.env.example` to `.env` and set `API_KEY`, `JWT_SECRET`, `ADMIN_BOOTSTRAP_MOBILE`, `ADMIN_BOOTSTRAP_PASSWORD`.
4) Start:
   - `pm2 start index.js --name whatsapp-gateway`
   - `pm2 save`

## Bootstrap Admin
1) Set `ADMIN_BOOTSTRAP_MOBILE` and `ADMIN_BOOTSTRAP_PASSWORD`.
2) Call (x-api-key required):
   - `curl -X POST http://localhost:4000/auth/bootstrap -H "x-api-key: $API_KEY"`

## Login (JWT)
1) `curl -X POST http://localhost:4000/auth/login -H "x-api-key: $API_KEY" -H "Content-Type: application/json" -d '{"mobile":"15551234567","password":"secret"}'`
2) Use the returned token for `/app/*` APIs.

## Create Instance + Scan QR
1) `curl -X POST http://localhost:4000/app/instances -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"label":"Sales"}'`
2) `curl http://localhost:4000/app/instances/1/start -H "Authorization: Bearer $TOKEN" -X POST`
3) `curl http://localhost:4000/app/instances/1/qr -H "Authorization: Bearer $TOKEN"`

## Create + Start Campaign
1) `curl -X POST http://localhost:4000/app/campaigns -H "Authorization: Bearer $TOKEN" -F "instance_id=1" -F "name=April Promo" -F "message=Hello" -F "recipients=15551234567"`
2) `curl -X POST http://localhost:4000/app/campaigns/1/start -H "Authorization: Bearer $TOKEN"`

## Verify Ops Endpoints
- `curl http://localhost:4000/ops/status -H "x-api-key: $API_KEY"`
- `curl http://localhost:4000/ops/events -H "x-api-key: $API_KEY"`

## Realtime Events
- `curl http://localhost:4000/app/events -H "Authorization: Bearer $TOKEN"`

## Nginx + HTTPS (EC2 Ubuntu 22.04/24.04)
### Install Nginx + Certbot
1) `sudo apt-get update`
2) `sudo apt-get install -y nginx certbot python3-certbot-nginx`
3) Create the ACME webroot:
   - `sudo mkdir -p /var/www/certbot`
   - `sudo chown -R www-data:www-data /var/www/certbot`

### Site configuration
1) Copy `nginx/personal-whatsapp-gateway.conf` to:
   - `/etc/nginx/sites-available/personal-whatsapp-gateway`
2) Update `server_name` to your domain (example: `gateway.example.com`).
3) Enable the site:
   - `sudo ln -s /etc/nginx/sites-available/personal-whatsapp-gateway /etc/nginx/sites-enabled/personal-whatsapp-gateway`
4) Test + reload:
   - `sudo nginx -t`
   - `sudo systemctl reload nginx`

### HTTP Basic Auth (Dashboard protection)
1) Create htpasswd file:
   - `sudo apt-get install -y apache2-utils`
   - `sudo htpasswd -c /etc/nginx/.htpasswd admin`
2) Add another user:
   - `sudo htpasswd /etc/nginx/.htpasswd newuser`
3) Remove a user:
   - `sudo htpasswd -D /etc/nginx/.htpasswd username`

### Issue SSL certificates (Let's Encrypt)
1) `sudo certbot --nginx -d gateway.example.com`
2) Verify auto-renewal:
   - `sudo certbot renew --dry-run`

### Dashboard protection test
- `curl -I https://gateway.example.com/dashboard` should return `401` without Basic Auth.
- `curl -I -u admin:YOURPASS https://gateway.example.com/dashboard` should return `200`.

### API behavior test (unchanged)
- `curl https://gateway.example.com/ops/status -H "x-api-key: $API_KEY"` should return `200`.
- `curl -X POST https://gateway.example.com/sendMessage -H "x-api-key: $API_KEY" -H "Content-Type: application/json" -d '{"number":"15551234567","message":"Hi"}'`

### SSE compatibility test
- `/app/events` and `/ops/events` should stream continuously over HTTPS (buffering off, long timeouts).

## Verification Checklist
- /sendMessage still returns same JSON shape and works over HTTPS.
- /ops/status works with x-api-key through Nginx.
- https://gateway.example.com/dashboard prompts for Basic Auth.
- /app/events and /ops/events stream without buffering errors.
