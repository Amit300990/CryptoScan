#!/usr/bin/env bash
# =============================================================================
# CryptoGuard — Ubuntu Installation Script
# =============================================================================
# Supports: Ubuntu 20.04 LTS, 22.04 LTS, 24.04 LTS
#
# Usage:
#   sudo bash install.sh                          # interactive install
#   sudo bash install.sh ssl                      # add SSL after DNS is set
#   sudo bash install.sh update                   # pull latest code & restart
#   sudo bash install.sh status                   # show service health
#   sudo bash install.sh logs                     # tail live logs
#
# Options (all have interactive prompts if omitted):
#   --domain   DOMAIN   e.g. crypto.example.com
#   --email    EMAIL    e.g. admin@example.com  (used for SSL cert)
#   --token    TOKEN    GitHub PAT (only needed if repo is private)
#   --yes               non-interactive, use defaults / auto-generate secrets
# =============================================================================
set -euo pipefail
IFS=$'\n\t'

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

log()     { echo -e "${GREEN}[✓]${NC} $*"; }
info()    { echo -e "${BLUE}[→]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
die()     { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }
section() { echo -e "\n${BOLD}${BLUE}══════════════════════════════════════════${NC}"; \
            echo -e "${BOLD}${BLUE}  $*${NC}"; \
            echo -e "${BOLD}${BLUE}══════════════════════════════════════════${NC}\n"; }

# ── Constants ─────────────────────────────────────────────────────────────────
APP_USER="cryptoguard"
APP_DIR="/opt/cryptoguard"
ENV_FILE="/etc/cryptoguard/env"
APP_PORT=3000
GITHUB_REPO="https://github.com/Amit300990/CryptoScan.git"
NODE_MAJOR=22
PG_VERSION=16
DB_NAME="cryptoguard"
DB_USER="cryptoguard"
SERVICE_NAME="cryptoguard"
NGINX_CONF="/etc/nginx/sites-available/cryptoguard"

# ── Argument parsing ──────────────────────────────────────────────────────────
DOMAIN=""
ADMIN_EMAIL=""
GITHUB_TOKEN=""
YES=false
COMMAND="install"

while [[ $# -gt 0 ]]; do
  case "$1" in
    ssl|update|status|logs) COMMAND="$1"; shift ;;
    --domain)   DOMAIN="$2";       shift 2 ;;
    --email)    ADMIN_EMAIL="$2";  shift 2 ;;
    --token)    GITHUB_TOKEN="$2"; shift 2 ;;
    --yes)      YES=true;          shift ;;
    -h|--help)
      grep '^#' "$0" | head -20 | sed 's/^# \?//'
      exit 0 ;;
    *) die "Unknown argument: $1. Use --help for usage." ;;
  esac
done

# ── Guards ────────────────────────────────────────────────────────────────────
require_root() {
  [[ $EUID -eq 0 ]] || die "Run this script with sudo:\n  sudo bash $0 $COMMAND"
}

check_ubuntu() {
  [[ -f /etc/os-release ]] || die "Cannot detect OS (missing /etc/os-release)"
  # shellcheck disable=SC1091
  source /etc/os-release
  [[ "$ID" == "ubuntu" ]] || die "This script requires Ubuntu. Detected: $ID $VERSION_ID"
  case "$VERSION_ID" in
    20.*|22.*|24.*) ;;
    *) warn "Tested on Ubuntu 20/22/24. Your version ($VERSION_ID) may work but is untested." ;;
  esac
}

check_internet() {
  info "Checking internet connectivity..."
  curl -fsSL --max-time 5 https://github.com > /dev/null 2>&1 \
    || die "No internet access. Ensure the server can reach github.com before installing."
}

check_memory() {
  local mem_mb
  mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
  if [[ $mem_mb -lt 1500 ]]; then
    warn "Only ${mem_mb}MB RAM detected. Build may fail. Adding swap..."
    add_swap
  else
    info "Memory: ${mem_mb}MB — sufficient."
  fi
}

add_swap() {
  if [[ -f /swapfile ]]; then
    info "Swap file already exists, skipping."
    return
  fi
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  log "2GB swap file created."
}

# ── Interactive prompts ───────────────────────────────────────────────────────
prompt_config() {
  section "Configuration"

  if [[ -z "$DOMAIN" ]]; then
    if $YES; then
      die "--domain is required in non-interactive mode (--yes)"
    fi
    read -rp "  Domain name (e.g. crypto.example.com): " DOMAIN
  fi
  [[ -n "$DOMAIN" ]] || die "Domain name cannot be empty."

  if [[ -z "$ADMIN_EMAIL" ]]; then
    if $YES; then
      die "--email is required in non-interactive mode (--yes)"
    fi
    read -rp "  Admin email for SSL certificate: " ADMIN_EMAIL
  fi
  [[ -n "$ADMIN_EMAIL" ]] || die "Admin email cannot be empty."

  if [[ -z "$GITHUB_TOKEN" ]] && ! $YES; then
    echo ""
    info "GitHub repo: ${GITHUB_REPO}"
    info "If the repo is public, press Enter to skip the token."
    read -rp "  GitHub Personal Access Token (blank = public repo): " GITHUB_TOKEN
  fi

  # Generate secrets
  DB_PASSWORD=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
  JWT_SECRET=$(openssl rand -hex 32)
  ENCRYPTION_KEY=$(openssl rand -hex 32)

  echo ""
  log "Domain:  $DOMAIN"
  log "Email:   $ADMIN_EMAIL"
  log "Secrets: auto-generated (stored in ${ENV_FILE})"
}

# ── System dependencies ───────────────────────────────────────────────────────
install_system_deps() {
  section "System Dependencies"

  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq \
    curl wget git openssl ca-certificates gnupg lsb-release \
    ufw software-properties-common build-essential

  # Node.js via NodeSource
  if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1 | tr -d 'v')" -lt $NODE_MAJOR ]]; then
    info "Installing Node.js ${NODE_MAJOR}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - > /dev/null
    apt-get install -y -qq nodejs
  fi
  log "Node.js $(node --version)"

  # pnpm
  if ! command -v pnpm &>/dev/null; then
    info "Installing pnpm..."
    npm install -g pnpm --silent
  fi
  log "pnpm $(pnpm --version)"

  # PostgreSQL
  if ! command -v psql &>/dev/null; then
    info "Installing PostgreSQL ${PG_VERSION}..."
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] \
https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list
    apt-get update -qq
    apt-get install -y -qq "postgresql-${PG_VERSION}"
  fi
  systemctl enable postgresql --now
  log "PostgreSQL $(psql --version | awk '{print $3}')"

  # Nginx
  if ! command -v nginx &>/dev/null; then
    info "Installing Nginx..."
    apt-get install -y -qq nginx
  fi
  systemctl enable nginx --now
  log "Nginx $(nginx -v 2>&1 | awk -F/ '{print $2}')"

  # Certbot (via snap — most reliable across Ubuntu versions)
  if ! command -v certbot &>/dev/null; then
    info "Installing Certbot..."
    snap install --classic certbot 2>/dev/null || apt-get install -y -qq certbot python3-certbot-nginx
    ln -sf /snap/bin/certbot /usr/bin/certbot 2>/dev/null || true
  fi
  log "Certbot $(certbot --version 2>&1 | awk '{print $2}')"
}

# ── Database setup ────────────────────────────────────────────────────────────
setup_database() {
  section "Database Setup"

  # Create role and database (idempotent)
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';
    RAISE NOTICE 'Role ${DB_USER} created.';
  ELSE
    ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
    RAISE NOTICE 'Role ${DB_USER} password updated.';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE' WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = '${DB_NAME}'
) \gexec
DO \$\$
BEGIN
  EXECUTE format('GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER}');
END
\$\$;
SQL

  # Grant schema privileges (PostgreSQL 15+ requires this)
  sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};" > /dev/null

  log "Database '${DB_NAME}' ready, user '${DB_USER}' configured."
}

# ── App user & directory ──────────────────────────────────────────────────────
setup_app_user() {
  section "Application User"

  if ! id "$APP_USER" &>/dev/null; then
    useradd --system --shell /bin/bash --home-dir "$APP_DIR" --create-home "$APP_USER"
    log "System user '${APP_USER}' created."
  else
    log "System user '${APP_USER}' already exists."
  fi
}

# ── Clone / update code ───────────────────────────────────────────────────────
clone_or_update_repo() {
  section "Application Code"

  local clone_url="$GITHUB_REPO"
  if [[ -n "$GITHUB_TOKEN" ]]; then
    # Embed token in URL (never echoed to stdout)
    clone_url="https://${GITHUB_TOKEN}@${GITHUB_REPO#https://}"
  fi

  if [[ -d "$APP_DIR/.git" ]]; then
    info "Updating existing installation..."
    sudo -u "$APP_USER" git -C "$APP_DIR" remote set-url origin "$clone_url"
    sudo -u "$APP_USER" git -C "$APP_DIR" fetch --quiet origin main
    sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard origin/main
    log "Code updated to latest."
  else
    info "Cloning repository..."
    rm -rf "$APP_DIR"
    sudo -u "$APP_USER" git clone --depth 1 "$clone_url" "$APP_DIR"
    log "Repository cloned to ${APP_DIR}."
  fi
}

# ── Write environment file ────────────────────────────────────────────────────
write_env_file() {
  section "Environment Configuration"

  mkdir -p /etc/cryptoguard
  chmod 700 /etc/cryptoguard

  # Preserve existing secrets on update (only overwrite if file missing)
  if [[ -f "$ENV_FILE" ]]; then
    info "Existing env file detected — preserving secrets."
    # Just update domain-dependent vars
    sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://${DOMAIN}|" "$ENV_FILE"
    return
  fi

  cat > "$ENV_FILE" <<EOF
# CryptoGuard — Environment Configuration
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Edit this file then run: sudo systemctl restart cryptoguard

NODE_ENV=production
PORT=${APP_PORT}

# Database
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}

# Security secrets — DO NOT SHARE
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# CORS — add your domain here
ALLOWED_ORIGINS=https://${DOMAIN}

# Optional: set log level (trace|debug|info|warn|error)
LOG_LEVEL=info
EOF

  chmod 600 "$ENV_FILE"
  chown root:root "$ENV_FILE"
  log "Environment file written to ${ENV_FILE}"

  # Save DB password separately for reference
  cat > /etc/cryptoguard/db-credentials <<EOF
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_HOST=localhost
DB_PORT=5432
EOF
  chmod 600 /etc/cryptoguard/db-credentials
}

# ── Build application ─────────────────────────────────────────────────────────
build_app() {
  section "Building Application"

  # pnpm-workspace.yaml references darwin esbuild overrides — ensure they don't
  # block install on Linux (allowBuilds already set in our config)
  cd "$APP_DIR"

  info "Installing dependencies..."
  sudo -u "$APP_USER" pnpm install --frozen-lockfile 2>&1 | tail -5

  info "Building shared libraries..."
  sudo -u "$APP_USER" pnpm run typecheck:libs 2>&1 | tail -5 || true

  info "Building frontend..."
  sudo -u "$APP_USER" env PORT=$APP_PORT BASE_PATH=/ \
    pnpm --filter "@workspace/crypto-manager" run build 2>&1 | tail -10

  info "Building API server..."
  sudo -u "$APP_USER" pnpm --filter "@workspace/api-server" run build 2>&1 | tail -10

  # Copy frontend build into API's public directory (single-service deploy)
  # Vite is configured to output to dist/public (vite.config.ts outDir)
  local frontend_dist="$APP_DIR/artifacts/crypto-manager/dist/public"
  local api_public="$APP_DIR/artifacts/api-server/dist/public"
  if [[ -d "$frontend_dist" ]]; then
    mkdir -p "$api_public"
    cp -a "$frontend_dist/." "$api_public/"
    log "Frontend assets copied to API public directory."
  else
    warn "Frontend dist not found at ${frontend_dist}. Dashboard UI may not load."
  fi

  log "Build complete."
}

# ── Database schema & seed ────────────────────────────────────────────────────
run_migrations() {
  section "Database Migrations"

  cd "$APP_DIR"

  info "Pushing database schema..."
  # Pass env vars explicitly so the sudo context has DATABASE_URL
  sudo -u "$APP_USER" \
    env $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs) \
    pnpm --filter "@workspace/db" run push 2>&1 | tail -10

  log "Schema applied."
}

# ── Systemd service ───────────────────────────────────────────────────────────
install_service() {
  section "Systemd Service"

  cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=CryptoGuard API Server
Documentation=https://github.com/Amit300990/CryptoScan
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node --enable-source-maps artifacts/api-server/dist/index.mjs
Restart=on-failure
RestartSec=5
StartLimitInterval=60
StartLimitBurst=3

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${APP_DIR}
ProtectHome=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cryptoguard

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"

  # Wait for the service to become healthy
  info "Waiting for service to start..."
  local retries=0
  until curl -fsS "http://localhost:${APP_PORT}/api/healthz" > /dev/null 2>&1; do
    sleep 2
    retries=$((retries + 1))
    [[ $retries -lt 15 ]] || die "Service failed to start. Check logs:\n  sudo journalctl -u ${SERVICE_NAME} -n 50"
  done
  log "Service '${SERVICE_NAME}' is running and healthy."
}

# ── Nginx reverse proxy ───────────────────────────────────────────────────────
install_nginx() {
  section "Nginx Configuration"

  # Remove default site if present
  rm -f /etc/nginx/sites-enabled/default

  cat > "$NGINX_CONF" <<EOF
# CryptoGuard — HTTP (port 80)
# Certbot will upgrade this to HTTPS automatically when you run: sudo bash install.sh ssl

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    # Security headers
    add_header X-Content-Type-Options  "nosniff"             always;
    add_header X-Frame-Options         "DENY"                always;
    add_header X-XSS-Protection        "0"                   always;
    add_header Referrer-Policy         "strict-origin-when-cross-origin" always;

    # Proxy everything to Node.js (which serves both API + static files)
    location / {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade        \$http_upgrade;
        proxy_set_header   Connection     "upgrade";
        proxy_set_header   Host           \$host;
        proxy_set_header   X-Real-IP      \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 90s;

        # SSE (Server-Sent Events) for scan-stream endpoint
        proxy_buffering    off;
        proxy_cache        off;
    }

    # Health check — bypass proxy, hit Nginx directly
    location /nginx-health {
        access_log off;
        return 200 "ok\n";
        add_header Content-Type text/plain;
    }
}
EOF

  ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/cryptoguard

  nginx -t
  systemctl reload nginx
  log "Nginx configured and reloaded."
}

# ── Firewall ──────────────────────────────────────────────────────────────────
setup_firewall() {
  section "Firewall (UFW)"

  ufw --force reset > /dev/null
  ufw default deny incoming > /dev/null
  ufw default allow outgoing > /dev/null
  ufw allow 22/tcp   comment "SSH"   > /dev/null
  ufw allow 80/tcp   comment "HTTP"  > /dev/null
  ufw allow 443/tcp  comment "HTTPS" > /dev/null
  ufw --force enable > /dev/null

  log "Firewall enabled: SSH (22), HTTP (80), HTTPS (443) allowed."
}

# ── SSL certificate ───────────────────────────────────────────────────────────
run_ssl_setup() {
  require_root

  # Load existing config if available
  if [[ -f "$ENV_FILE" ]]; then
    set -a; source "$ENV_FILE"; set +a
  fi

  if [[ -z "$DOMAIN" ]]; then
    read -rp "  Domain name to issue certificate for: " DOMAIN
  fi
  if [[ -z "$ADMIN_EMAIL" ]]; then
    read -rp "  Email address for Let's Encrypt: " ADMIN_EMAIL
  fi

  [[ -n "$DOMAIN" ]]      || die "Domain is required."
  [[ -n "$ADMIN_EMAIL" ]] || die "Email is required."

  section "SSL Certificate"
  info "Issuing certificate for ${DOMAIN} via Let's Encrypt..."

  certbot --nginx \
    --non-interactive \
    --agree-tos \
    --email "$ADMIN_EMAIL" \
    --domains "$DOMAIN" \
    --redirect

  # Update ALLOWED_ORIGINS to use https
  if [[ -f "$ENV_FILE" ]]; then
    sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://${DOMAIN}|" "$ENV_FILE"
    systemctl restart "$SERVICE_NAME"
    log "ALLOWED_ORIGINS updated to https://${DOMAIN}"
  fi

  # Verify auto-renewal
  systemctl enable snap.certbot.renew.timer 2>/dev/null || \
    systemctl enable certbot.timer 2>/dev/null || true

  log "SSL certificate installed. Auto-renewal configured."
  echo ""
  echo -e "${GREEN}${BOLD}CryptoGuard is now available at:${NC}"
  echo -e "${BOLD}  https://${DOMAIN}${NC}"
}

# ── Status / Logs helpers ─────────────────────────────────────────────────────
run_status() {
  require_root
  echo ""
  systemctl status "$SERVICE_NAME" --no-pager -l
  echo ""
  echo "Health check:"
  curl -fsS "http://localhost:${APP_PORT}/api/healthz" && echo "" || echo "FAILED"
}

run_logs() {
  require_root
  exec journalctl -u "$SERVICE_NAME" -f --no-pager
}

# ── Update helper ─────────────────────────────────────────────────────────────
run_update() {
  require_root
  check_internet

  section "Updating CryptoGuard"

  # Reload env to get GITHUB_TOKEN if stored
  [[ -f "$ENV_FILE" ]] && { set -a; source "$ENV_FILE"; set +a; } || true

  clone_or_update_repo
  build_app

  systemctl restart "$SERVICE_NAME"

  info "Waiting for service to restart..."
  local retries=0
  until curl -fsS "http://localhost:${APP_PORT}/api/healthz" > /dev/null 2>&1; do
    sleep 2
    retries=$((retries + 1))
    [[ $retries -lt 15 ]] || die "Service failed to restart after update."
  done

  log "CryptoGuard updated and running."
}

# ── Post-install summary ──────────────────────────────────────────────────────
print_summary() {
  echo ""
  echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}${GREEN}  CryptoGuard installed successfully!${NC}"
  echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  App URL (HTTP):   ${BOLD}http://${DOMAIN}${NC}"
  echo -e "  Health check:     ${BOLD}http://${DOMAIN}/api/healthz${NC}"
  echo -e "  Config file:      ${BOLD}${ENV_FILE}${NC}"
  echo -e "  DB credentials:   ${BOLD}/etc/cryptoguard/db-credentials${NC}"
  echo -e "  Service logs:     ${BOLD}sudo journalctl -u cryptoguard -f${NC}"
  echo ""
  echo -e "${BOLD}${YELLOW}Next step — add SSL certificate:${NC}"
  echo ""
  echo -e "  1. Point your DNS A record for ${BOLD}${DOMAIN}${NC} to this server's IP:"
  echo -e "     ${BOLD}$(curl -4 -fsS ifconfig.me 2>/dev/null || echo '<your-server-ip>')${NC}"
  echo ""
  echo -e "  2. Wait for DNS to propagate (2–30 minutes), then run:"
  echo -e "     ${BOLD}sudo bash $(realpath "$0") ssl --domain ${DOMAIN} --email ${ADMIN_EMAIL}${NC}"
  echo ""
  echo -e "  Or run the one-liner after DNS propagates:"
  echo -e "     ${BOLD}sudo bash ${APP_DIR}/install.sh ssl --domain ${DOMAIN} --email ${ADMIN_EMAIL}${NC}"
  echo ""
}

# ── Main install flow ─────────────────────────────────────────────────────────
run_install() {
  require_root
  check_ubuntu
  check_internet
  check_memory
  prompt_config

  install_system_deps
  setup_database
  setup_app_user
  clone_or_update_repo
  write_env_file
  build_app
  run_migrations
  install_service
  install_nginx
  setup_firewall
  print_summary
}

# ── Entrypoint ────────────────────────────────────────────────────────────────
case "$COMMAND" in
  install) run_install ;;
  ssl)     run_ssl_setup ;;
  update)  run_update ;;
  status)  run_status ;;
  logs)    run_logs ;;
  *)       die "Unknown command: $COMMAND" ;;
esac
