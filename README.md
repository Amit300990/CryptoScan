# CryptoGuard

Multi-cloud cryptographic asset management platform. Discover, inventory, and monitor all cryptographic material across AWS, Azure, GCP, VMware, and on-premises environments — then automatically flag weak algorithms, expiring certificates, short key lengths, and quantum-unsafe configurations against configurable policy rules.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Local Development](#local-development)
- [Production Deployment — Ubuntu](#production-deployment--ubuntu)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)

---

## Overview

CryptoGuard connects to your cloud environments, scans for cryptographic assets (TLS certificates, symmetric keys, asymmetric keys, SSH keys, KMS keys, secrets, code-signing keys), evaluates each asset against your policy library, and surfaces findings with remediation guidance.

```
Cloud environments  →  Scanner engine  →  Risk findings  →  Dashboard
  AWS / Azure / GCP       per-provider          policy eval       web UI
  VMware / On-Prem         adapters              + severity
```

---

## Features

### Asset Discovery
- **AWS** — ACM certificates, IAM keys, KMS keys, Secrets Manager
- **Azure** — Key Vault keys, certificates, and secrets
- **GCP** — Cloud KMS key rings and cryptographic keys
- **VMware vSphere** — SSH keys, TLS certificates, API tokens
- **On-Premises** — SSH host keys, TLS certs, LDAP bind credentials, PKI chain

### Policy Engine
- Built-in policies: SHA-1 rejection, RSA < 2048-bit, RSA < 3072-bit, certificate expiry (90/30/7 day warnings), EC P-256, quantum-safety checks
- Expression-based rule engine — write custom rules against any asset attribute
- Severity levels: `critical`, `high`, `medium`, `low`
- Enable / disable individual policies

### Risk Scoring
- Environment-level aggregate risk score (0–100)
- Per-asset risk level (`critical` → `info`)
- Quantum-safety flag on every asset

### Findings Management
- Full finding lifecycle: `open` → `acknowledged` → `resolved` → `suppressed`
- Remediation advice per finding
- Filter by severity, status, environment

### Live Scan Streaming
- Server-Sent Events endpoint (`/api/environments/:id/scan-stream`)
- Real-time progress as assets are discovered
- Keepalive pings to survive proxy timeouts

### Security
- JWT authentication (7-day tokens, HS256)
- bcryptjs password hashing
- AES-256-GCM encryption for stored cloud credentials
- Global rate limiting (200 req/min) + scan-specific limit (10 req/min)
- Security headers: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- CORS origin whitelist via `ALLOWED_ORIGINS`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser / Client                                               │
│  React 19 + Vite · Wouter routing · TanStack Query             │
│  Tailwind CSS + Radix UI · Recharts · Framer Motion            │
└────────────────────────┬────────────────────────────────────────┘
                         │  HTTPS (Nginx reverse proxy in prod)
┌────────────────────────▼────────────────────────────────────────┐
│  Express API Server  (Node.js 22, ESM)                          │
│                                                                 │
│  Public endpoints (no auth)                                     │
│    POST /api/auth/register                                      │
│    POST /api/auth/login                                         │
│    GET  /api/healthz                                            │
│                                                                 │
│  JWT middleware  ──────────────────────────────────────────────▶│
│                                                                 │
│  Protected endpoints                                            │
│    /api/environments   /api/assets       /api/findings          │
│    /api/connections    /api/policies     /api/scan-jobs         │
│    /api/dashboard      /api/logs         /api/settings          │
│    /api/auth/me                                                 │
│                                                                 │
│  Scanner engine                                                 │
│    ┌────────┐ ┌────────┐ ┌─────┐ ┌────────┐ ┌────────────┐    │
│    │  AWS   │ │ Azure  │ │ GCP │ │VMware  │ │ On-Prem    │    │
│    └────────┘ └────────┘ └─────┘ └────────┘ └────────────┘    │
│                                                                 │
│  Static file serving (production — frontend dist embedded)      │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│  PostgreSQL 16                                                  │
│  environments · crypto_assets · findings · policy_rules         │
│  scan_jobs · environment_connections · system_logs · settings   │
│  users                                                          │
└─────────────────────────────────────────────────────────────────┘
```

### Monorepo workspace layout

```
lib/
  db/                   Drizzle ORM schema + db client
  api-zod/              Auto-generated Zod schemas (from OpenAPI)
  api-client-react/     Auto-generated React Query hooks + customFetch
  api-spec/             OpenAPI 3.1 spec + Orval codegen config

artifacts/
  api-server/           Express backend
  crypto-manager/       React web dashboard
  crypto-mobile/        Expo / React Native mobile app (separate)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 (ESM) |
| API framework | Express 5 |
| Database | PostgreSQL 16 + Drizzle ORM |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Frontend | React 19 + Vite 7 |
| Routing | Wouter |
| Server state | TanStack React Query |
| UI components | Radix UI + shadcn/ui |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| Logging | Pino |
| Build | esbuild (API), Vite (frontend) |
| Package manager | pnpm (workspaces) |
| Type validation | Zod v4 |
| Code generation | Orval (OpenAPI → types + hooks) |
| Deployment | Ubuntu systemd + Nginx |

---

## Database Schema

| Table | Purpose |
|---|---|
| `users` | User accounts — email, bcrypt password hash, display name |
| `environments` | Cloud / on-prem environments — type, region, status, risk score |
| `environment_connections` | Encrypted provider credentials per environment |
| `scan_jobs` | Scan execution records — status, asset/finding counts |
| `crypto_assets` | Discovered assets — algorithm, key length, expiry, risk level, quantum-safety |
| `findings` | Policy violations — severity, status, remediation advice |
| `policy_rules` | Configurable compliance rules — expression, severity, enabled flag |
| `system_logs` | Audit log — category, message, environment linkage |
| `settings` | Key-value application configuration (JSONB) |

### Asset types

`certificate` · `symmetric_key` · `asymmetric_key` · `tls_config` · `ssh_key` · `code_signing_key` · `kms_key` · `secret`

### Risk levels

`critical` · `high` · `medium` · `low` · `info`

---

## API Reference

All protected routes require `Authorization: Bearer <token>`.

### Auth (public)

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/api/auth/register` | `{ email, password, name? }` | `{ token, user }` |
| `POST` | `/api/auth/login` | `{ email, password }` | `{ token, user }` |
| `GET` | `/api/auth/me` | — | `{ id, email, name }` |
| `GET` | `/api/healthz` | — | `{ status: "ok" }` |

### Environments

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/environments` | List all environments |
| `POST` | `/api/environments` | Create environment |
| `GET` | `/api/environments/:id` | Get environment |
| `PUT` | `/api/environments/:id` | Update environment |
| `DELETE` | `/api/environments/:id` | Delete environment + all related data |
| `POST` | `/api/environments/:id/scan` | Trigger scan (rate-limited: 10/min) |
| `GET` | `/api/environments/:id/scan-stream` | SSE stream of scan progress |

### Assets

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/assets` | List assets (paginated, max 1000) |
| `GET` | `/api/assets/:id` | Get asset + findings |

### Findings

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/findings` | List findings (filter by env, severity, status) |
| `GET` | `/api/findings/:id` | Get finding |
| `PATCH` | `/api/findings/:id` | Update finding status |

### Policies

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/policies` | List policy rules |
| `POST` | `/api/policies` | Create policy rule |
| `PUT` | `/api/policies/:id` | Update policy rule |
| `DELETE` | `/api/policies/:id` | Delete policy rule |

### Other

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/scan-jobs` | List scan jobs |
| `GET` | `/api/scan-jobs/:id` | Get scan job |
| `GET` | `/api/connections` | List environment connections |
| `POST` | `/api/connections` | Create / update connection |
| `DELETE` | `/api/connections/:id` | Delete connection |
| `GET` | `/api/dashboard` | Aggregated metrics |
| `GET` | `/api/logs` | System audit logs |
| `GET` | `/api/settings` | Application settings |
| `PUT` | `/api/settings` | Update settings |

---

## Local Development

### Prerequisites

- Node.js 22+
- pnpm 9+
- PostgreSQL 14+

### 1. Clone and install

```bash
git clone https://github.com/Amit300990/CryptoScan.git
cd CryptoScan
pnpm install
```

### 2. Create the database

```bash
createdb cryptoguard        # macOS (Homebrew) / Linux
# or: sudo -u postgres createdb cryptoguard
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```dotenv
DATABASE_URL=postgresql://YOUR_USER@localhost:5432/cryptoguard
JWT_SECRET=<output of: openssl rand -hex 32>
ENCRYPTION_KEY=<output of: openssl rand -hex 32>
PORT=3000
NODE_ENV=development
```

### 4. Push database schema

```bash
pnpm --filter "@workspace/db" run push
```

### 5. Build and start the API server

```bash
pnpm --filter "@workspace/api-server" run build
PORT=3000 node --enable-source-maps artifacts/api-server/dist/index.mjs
```

The server starts on `http://localhost:3000`. On first start it seeds default environments and policy rules.

### 6. Start the frontend dev server

In a second terminal:

```bash
pnpm --filter "@workspace/crypto-manager" run dev
```

Open `http://localhost:5173`. Vite proxies all `/api/*` requests to port 3000 — no CORS setup needed locally.

### 7. Create your account

Navigate to `http://localhost:5173/sign-up` and register with any email + password.

---

## Production Deployment — Ubuntu

A single shell script installs and configures everything on Ubuntu 20.04, 22.04, or 24.04 LTS.

**What the script installs:**

- Node.js 22 (NodeSource)
- pnpm
- PostgreSQL 16
- Nginx (reverse proxy)
- Certbot / Let's Encrypt (SSL)
- UFW firewall (ports 22, 80, 443)
- `cryptoguard` systemd service

### Step 1 — Provision a server

Any Ubuntu 20/22/24 VPS with at least 1 vCPU and 2 GB RAM (the build step needs ~1.5 GB). Ensure SSH access as root or a sudo user.

### Step 2 — Run the install script

Copy `install.sh` to the server and run it as root:

```bash
# on the server
curl -fsSL https://raw.githubusercontent.com/Amit300990/CryptoScan/main/install.sh -o install.sh
sudo bash install.sh
```

The script prompts for:

| Prompt | Example |
|---|---|
| Domain name | `crypto.example.com` |
| Admin email | `admin@example.com` |
| GitHub token | *(leave blank if repo is public)* |

It will auto-generate the database password, JWT secret, and encryption key, then save them to `/etc/cryptoguard/env` (readable by root only).

At the end, the script prints your server's public IP.

### Step 3 — Point DNS to the server

In your DNS provider, add an **A record**:

```
crypto.example.com  →  <server IP>
```

Wait for propagation (usually 5–30 minutes). Verify with:

```bash
dig +short crypto.example.com
```

### Step 4 — Install SSL certificate

Once DNS resolves, run:

```bash
sudo bash install.sh ssl --domain crypto.example.com --email admin@example.com
```

Certbot issues a Let's Encrypt certificate, reconfigures Nginx for HTTPS, and enables auto-renewal. Your app is now live at `https://crypto.example.com`.

### Management commands

```bash
sudo bash install.sh status   # check service health
sudo bash install.sh logs     # tail live logs
sudo bash install.sh update   # pull latest code from GitHub and redeploy
```

Or use systemd directly:

```bash
sudo systemctl status  cryptoguard
sudo systemctl restart cryptoguard
sudo journalctl -u cryptoguard -f     # follow logs
```

### Configuration after install

Edit `/etc/cryptoguard/env` to change any setting, then restart:

```bash
sudo nano /etc/cryptoguard/env
sudo systemctl restart cryptoguard
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string — `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Yes | 256-bit hex secret for signing JWTs — `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Yes (prod) | 256-bit hex key for AES-256-GCM credential encryption |
| `PORT` | No | API server port (default: `3000`) |
| `NODE_ENV` | No | `development` or `production` |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins, e.g. `https://crypto.example.com` |
| `LOG_LEVEL` | No | Pino log level: `trace`, `debug`, `info`, `warn`, `error` (default: `info`) |

In development, `ALLOWED_ORIGINS` is not needed — Vite proxies `/api` requests server-side.

---

## Project Structure

```
CryptoScan/
│
├── lib/                          Shared workspace packages
│   ├── db/                       Drizzle ORM — schema, migrations, db client
│   │   └── src/schema/           9 table definitions
│   ├── api-zod/                  Auto-generated Zod request/response schemas
│   ├── api-client-react/         Auto-generated React Query hooks + customFetch
│   └── api-spec/                 OpenAPI 3.1 spec + Orval codegen config
│
├── artifacts/
│   ├── api-server/               Express backend
│   │   └── src/
│   │       ├── app.ts            Express app — middleware, CORS, routes
│   │       ├── index.ts          Server entry point — env validation, startup
│   │       ├── routes/           One file per resource (12 route files)
│   │       ├── lib/
│   │       │   ├── scanner.ts    Scan orchestrator — dispatches to provider adapters
│   │       │   ├── scanners/     AWS / Azure / GCP / VMware / on-prem adapters
│   │       │   ├── credentials.ts AES-256-GCM encrypt/decrypt
│   │       │   ├── jwtAuth.ts    JWT sign, verify, middleware
│   │       │   ├── rateLimiter.ts In-memory rate limiting
│   │       │   ├── scanEventBus.ts SSE event bus for scan progress
│   │       │   ├── seed.ts       Default environments + policies
│   │       │   └── logger.ts     Pino logger
│   │       ├── middlewares/
│   │       │   └── errorHandler.ts asyncHandler, ApiError, global error handler
│   │       └── types/
│   │           └── express.d.ts  req.user type augmentation
│   │
│   ├── crypto-manager/           React web dashboard
│   │   └── src/
│   │       ├── App.tsx           Router, QueryClient, AuthProvider
│   │       ├── pages/            Dashboard, Environments, Assets, Findings,
│   │       │                     Policies, ScanHistory, Logs, Settings,
│   │       │                     SignIn, SignUp (12 pages)
│   │       ├── components/
│   │       │   ├── layout/       AppLayout, sidebar, nav
│   │       │   └── ui/           57 Radix UI + shadcn components
│   │       ├── context/
│   │       │   └── AuthContext.tsx JWT auth state, login/register/logout
│   │       └── hooks/            Custom React hooks
│   │
│   └── crypto-mobile/            Expo / React Native mobile app
│
├── Dockerfile                    Multi-stage build (deps → libs → frontend → api → runner)
├── install.sh                    Ubuntu self-hosted install script
├── .env.example                  Environment variable reference
├── package.json                  Workspace root — enforces pnpm
├── pnpm-workspace.yaml           Workspace definition + supply-chain policy
└── tsconfig.base.json            Shared TypeScript base config
```
