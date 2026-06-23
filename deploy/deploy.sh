#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${DEPLOY_ENV_FILE:-$ROOT_DIR/deploy/.env}"
BUILD_ROOT="$ROOT_DIR"

log() {
  printf '==> %s\n' "$*"
}

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0

  set -a
  set +u
  # shellcheck source=/dev/null
  source "$file"
  set -u
  set +a
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

require_var() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "$name is required; set it in $ENV_FILE"
}

json_field() {
  local expression="$1"
  node --input-type=module -e "
    const input = await new Promise((resolve) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => data += chunk);
      process.stdin.on('end', () => resolve(data));
    });
    const json = JSON.parse(input || '{}');
    const value = $expression;
    if (value !== undefined && value !== null) process.stdout.write(String(value));
  "
}

file_hash() {
  node --input-type=module -e "
    import { createHash } from 'node:crypto';
    import { readFileSync } from 'node:fs';
    process.stdout.write(createHash('sha256').update(readFileSync(process.argv[1])).digest('hex'));
  " "$1"
}

cloudflare_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local args=(-fsS -X "$method" -H "Authorization: Bearer $DEPLOY_CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json")

  if [[ -n "$data" ]]; then
    args+=("--data" "$data")
  fi

  curl "${args[@]}" "https://api.cloudflare.com/client/v4$path"
}

upsert_dns_record() {
  if [[ "${DEPLOY_SKIP_DNS:-0}" == "1" ]]; then
    log "Skipping DNS update"
    return
  fi

  require_var DEPLOY_CLOUDFLARE_ZONE_ID
  require_var DEPLOY_CLOUDFLARE_API_TOKEN

  log "Ensuring Cloudflare A record for $DEPLOY_DOMAIN"
  local query
  query="$(cloudflare_api GET "/zones/$DEPLOY_CLOUDFLARE_ZONE_ID/dns_records?type=A&name=$DEPLOY_DOMAIN")"

  local record_id current_content current_proxied
  record_id="$(printf '%s' "$query" | json_field "json.result?.[0]?.id")"
  current_content="$(printf '%s' "$query" | json_field "json.result?.[0]?.content")"
  current_proxied="$(printf '%s' "$query" | json_field "json.result?.[0]?.proxied")"

  local payload
  payload="$(node --input-type=module -e "
    process.stdout.write(JSON.stringify({
      type: 'A',
      name: process.env.DEPLOY_DOMAIN,
      content: process.env.DEPLOY_DNS_TARGET,
      ttl: 300,
      proxied: false
    }));
  ")"

  if [[ -z "$record_id" ]]; then
    cloudflare_api POST "/zones/$DEPLOY_CLOUDFLARE_ZONE_ID/dns_records" "$payload" >/dev/null
    return
  fi

  if [[ "$current_content" == "$DEPLOY_DNS_TARGET" && "$current_proxied" == "false" ]]; then
    return
  fi

  cloudflare_api PUT "/zones/$DEPLOY_CLOUDFLARE_ZONE_ID/dns_records/$record_id" "$payload" >/dev/null
}

wait_for_dns() {
  require_command dig

  log "Waiting for DNS to resolve to $DEPLOY_DNS_TARGET"
  for _ in {1..30}; do
    if dig +short "$DEPLOY_DOMAIN" | grep -Fxq "$DEPLOY_DNS_TARGET"; then
      return
    fi

    local resolver
    for resolver in ${DEPLOY_DNS_RESOLVERS:-1.1.1.1 8.8.8.8}; do
      if dig +short "@$resolver" "$DEPLOY_DOMAIN" | grep -Fxq "$DEPLOY_DNS_TARGET"; then
        return
      fi
    done

    sleep 2
  done

  fail "$DEPLOY_DOMAIN did not resolve to $DEPLOY_DNS_TARGET in time"
}

prepare_build_root() {
  local ref="${DEPLOY_BUILD_REF:-working-tree}"
  if [[ -z "$ref" || "$ref" == "working-tree" ]]; then
    BUILD_ROOT="$ROOT_DIR"
    return
  fi

  require_command git

  local build_dir="${DEPLOY_BUILD_DIR:-deploy/.build-worktree}"
  if [[ "$build_dir" != /* ]]; then
    build_dir="$ROOT_DIR/$build_dir"
  fi

  log "Preparing clean build worktree at $ref"
  mkdir -p "$(dirname "$build_dir")"

  if [[ -e "$build_dir/.git" ]]; then
    git -C "$build_dir" reset --hard >/dev/null
    git -C "$build_dir" clean -fd -e node_modules -e dist >/dev/null
    git -C "$build_dir" checkout --detach "$ref" >/dev/null
    git -C "$build_dir" reset --hard "$ref" >/dev/null
  else
    rm -rf "$build_dir"
    git worktree prune
    git worktree add --detach "$build_dir" "$ref" >/dev/null
  fi

  local hash_file="$build_dir/node_modules/.rogue-package-lock.sha256"
  local lock_hash
  lock_hash="$(file_hash "$build_dir/package-lock.json")"
  if [[ ! -d "$build_dir/node_modules" || ! -f "$hash_file" || "$(cat "$hash_file")" != "$lock_hash" ]]; then
    log "Installing build dependencies"
    (cd "$build_dir" && npm ci)
    mkdir -p "$(dirname "$hash_file")"
    printf '%s' "$lock_hash" >"$hash_file"
  fi

  BUILD_ROOT="$build_dir"
}

write_nginx_config() {
  local mode="$1"
  local output="$2"

  if [[ "$mode" == "initial" ]]; then
    cat >"$output" <<NGINX
server {
    listen 80;
    server_name $DEPLOY_DOMAIN;
    root $DEPLOY_APP_DIR/dist;
    index index.html;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX
    return
  fi

  cat >"$output" <<NGINX
server {
    listen 80;
    server_name $DEPLOY_DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name $DEPLOY_DOMAIN;
    root $DEPLOY_APP_DIR/dist;
    index index.html;

    ssl_certificate /etc/letsencrypt/live/$DEPLOY_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DEPLOY_DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'" always;

    location /assets/ {
        try_files \$uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX
}

preflight_deploy() {
  log "Running deploy preflight"
  ssh "$DEPLOY_SERVER" bash -s -- "$DEPLOY_APP_DIR" <<'REMOTE'
set -Eeuo pipefail

app_dir="$1"

for command_name in nginx certbot systemctl mktemp sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'missing remote command: %s\n' "$command_name" >&2
    exit 1
  }
done

[[ -d /etc/nginx/sites-available ]] || {
  printf 'missing nginx sites-available directory\n' >&2
  exit 1
}

[[ -d /etc/nginx/sites-enabled ]] || {
  printf 'missing nginx sites-enabled directory\n' >&2
  exit 1
}

mkdir -p "$app_dir/dist" /var/www/html
[[ -w "$app_dir/dist" ]] || {
  printf 'remote dist directory is not writable: %s/dist\n' "$app_dir" >&2
  exit 1
}
REMOTE
}

install_nginx_config() {
  local mode="$1"
  local tmp_config
  tmp_config="$(mktemp)"
  write_nginx_config "$mode" "$tmp_config"

  local remote_tmp="/tmp/rogue-nginx-$DEPLOY_DOMAIN.$$"
  log "Checking nginx config ($mode)"
  scp -q "$tmp_config" "$DEPLOY_SERVER:$remote_tmp"
  rm -f "$tmp_config"

  local status
  if ssh "$DEPLOY_SERVER" bash -s -- "$mode" "$DEPLOY_DOMAIN" "$remote_tmp" <<'REMOTE'
set -Eeuo pipefail

mode="$1"
domain="$2"
candidate="$3"
available="/etc/nginx/sites-available/$domain"
enabled="/etc/nginx/sites-enabled/$domain"
candidate_hash="$(sha256sum "$candidate" | awk '{print $1}')"
current_hash=""
enabled_target=""

if [[ -f "$available" ]]; then
  current_hash="$(sha256sum "$available" | awk '{print $1}')"
fi

if [[ -L "$enabled" ]]; then
  enabled_target="$(readlink "$enabled")"
fi

if [[ "$candidate_hash" == "$current_hash" && "$enabled_target" == "$available" ]]; then
  rm -f "$candidate"
  exit 10
fi

backup=""
had_available=0
if [[ -e "$available" ]]; then
  had_available=1
  backup="$(mktemp)"
  cp -a "$available" "$backup"
fi

cleanup() {
  rm -f "$candidate"
  if [[ -n "${backup:-}" ]]; then
    rm -f "$backup"
  fi
}
trap cleanup EXIT

printf 'Installing nginx config (%s)\n' "$mode"
cp "$candidate" "$available"
ln -sfn "$available" "$enabled"

if ! nginx -t; then
  if [[ "$had_available" == "1" ]]; then
    cp -a "$backup" "$available"
  else
    rm -f "$available" "$enabled"
  fi
  printf 'nginx config failed validation; restored previous %s config\n' "$domain" >&2
  exit 1
fi

systemctl reload nginx
REMOTE
  then
    log "Installed nginx config ($mode)"
    return
  else
    status=$?
  fi

  if [[ "$status" -eq 10 ]]; then
    log "nginx config ($mode) already current; skipping reload"
    return
  fi

  fail "nginx config ($mode) failed preflight"
}

ensure_certificate() {
  if ssh "$DEPLOY_SERVER" "test -f /etc/letsencrypt/live/$DEPLOY_DOMAIN/fullchain.pem"; then
    return
  fi

  install_nginx_config initial

  log "Requesting TLS certificate"
  ssh "$DEPLOY_SERVER" "mkdir -p /var/www/html && certbot certonly --webroot -w /var/www/html -d $DEPLOY_DOMAIN --non-interactive --agree-tos --email $DEPLOY_CERTBOT_EMAIL --keep-until-expiring"
}

ensure_certificate_renewal() {
  log "Checking Let's Encrypt automatic renewal"
  local status
  if ssh "$DEPLOY_SERVER" bash -s <<'REMOTE'
set -Eeuo pipefail

hook_dir="/etc/letsencrypt/renewal-hooks/deploy"
hook_path="$hook_dir/reload-nginx.sh"
desired_hook="$(mktemp)"

cleanup() {
  rm -f "$desired_hook"
}
trap cleanup EXIT

cat >"$desired_hook" <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail
systemctl reload nginx
HOOK

mkdir -p "$hook_dir"

hook_current=0
if [[ -f "$hook_path" ]] && [[ "$(sha256sum "$hook_path" | awk '{print $1}')" == "$(sha256sum "$desired_hook" | awk '{print $1}')" ]]; then
  hook_current=1
else
  cp "$desired_hook" "$hook_path"
  chmod +x "$hook_path"
fi

timer_current=0
if systemctl is-enabled certbot.timer >/dev/null 2>&1 && systemctl is-active certbot.timer >/dev/null 2>&1; then
  timer_current=1
fi

if [[ "$hook_current" == "1" && "$timer_current" == "1" ]]; then
  exit 10
fi

systemctl enable --now certbot.timer
systemctl is-enabled certbot.timer >/dev/null
systemctl is-active certbot.timer >/dev/null
REMOTE
  then
    log "Configured Let's Encrypt automatic renewal"
    return
  else
    status=$?
  fi

  if [[ "$status" -eq 10 ]]; then
    log "Let's Encrypt automatic renewal already current"
    return
  fi

  fail "Let's Encrypt automatic renewal preflight failed"
}

deploy_static_files() {
  prepare_build_root

  log "Building"
  (cd "$BUILD_ROOT" && npm run build)

  log "Syncing dist to $DEPLOY_SERVER:$DEPLOY_APP_DIR"
  ssh "$DEPLOY_SERVER" "mkdir -p $DEPLOY_APP_DIR/dist"
  rsync -az --delete --stats "$BUILD_ROOT/dist/" "$DEPLOY_SERVER:$DEPLOY_APP_DIR/dist/"
}

verify_deploy() {
  log "Verifying https://$DEPLOY_DOMAIN"
  local resolve_arg=""
  if ! dig +short "$DEPLOY_DOMAIN" | grep -Fxq "$DEPLOY_DNS_TARGET"; then
    resolve_arg="$DEPLOY_DOMAIN:443:$DEPLOY_DNS_TARGET"
  fi

  if [[ -n "$resolve_arg" ]]; then
    curl -fsSI --resolve "$resolve_arg" "https://$DEPLOY_DOMAIN" >/dev/null
    curl -fsS --resolve "$resolve_arg" "https://$DEPLOY_DOMAIN" | grep -Eq '<div id="app"></div>|<script[^>]+type="module"'
    return
  fi

  curl -fsSI "https://$DEPLOY_DOMAIN" >/dev/null
  curl -fsS "https://$DEPLOY_DOMAIN" | grep -Eq '<div id="app"></div>|<script[^>]+type="module"'
}

main() {
  cd "$ROOT_DIR"

  load_env_file "${DEPLOY_SECRETS_FILE:-$HOME/.secrets}"
  [[ -f "$ENV_FILE" ]] || fail "missing $ENV_FILE; copy deploy/.env.example and fill it in"
  load_env_file "$ENV_FILE"
  load_env_file "${DEPLOY_SECRETS_FILE:-$HOME/.secrets}"

  DEPLOY_CLOUDFLARE_ZONE_ID="${DEPLOY_CLOUDFLARE_ZONE_ID:-${CLOUDFLARE_ZONE_ID:-}}"
  DEPLOY_CLOUDFLARE_API_TOKEN="${DEPLOY_CLOUDFLARE_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"

  require_var DEPLOY_DOMAIN
  require_var DEPLOY_SERVER
  require_var DEPLOY_DNS_TARGET
  require_var DEPLOY_APP_DIR
  require_var DEPLOY_CERTBOT_EMAIL

  require_command curl
  require_command node
  require_command npm
  require_command rsync
  require_command scp
  require_command ssh

  preflight_deploy
  upsert_dns_record
  wait_for_dns
  deploy_static_files
  ensure_certificate
  ensure_certificate_renewal
  install_nginx_config https
  verify_deploy

  log "Done: https://$DEPLOY_DOMAIN"
}

main "$@"
