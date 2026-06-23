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

install_nginx_config() {
  local mode="$1"
  local tmp_config
  tmp_config="$(mktemp)"
  write_nginx_config "$mode" "$tmp_config"

  log "Installing nginx config ($mode)"
  scp -q "$tmp_config" "$DEPLOY_SERVER:/etc/nginx/sites-available/$DEPLOY_DOMAIN"
  rm -f "$tmp_config"
  ssh "$DEPLOY_SERVER" "ln -sf /etc/nginx/sites-available/$DEPLOY_DOMAIN /etc/nginx/sites-enabled/$DEPLOY_DOMAIN && nginx -t && systemctl reload nginx"
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
  log "Configuring Let's Encrypt automatic renewal"
  ssh "$DEPLOY_SERVER" "mkdir -p /etc/letsencrypt/renewal-hooks/deploy && cat >/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail
systemctl reload nginx
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
systemctl enable --now certbot.timer
systemctl is-enabled certbot.timer >/dev/null
systemctl is-active certbot.timer >/dev/null"
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
  local curl_args=()
  if ! dig +short "$DEPLOY_DOMAIN" | grep -Fxq "$DEPLOY_DNS_TARGET"; then
    curl_args=(--resolve "$DEPLOY_DOMAIN:443:$DEPLOY_DNS_TARGET")
  fi

  curl -fsSI "${curl_args[@]}" "https://$DEPLOY_DOMAIN" >/dev/null
  curl -fsS "${curl_args[@]}" "https://$DEPLOY_DOMAIN" | grep -Eq '<div id="app"></div>|<script[^>]+type="module"'
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
