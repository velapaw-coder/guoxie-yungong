#!/usr/bin/env bash
# 只用 CLOUDFLARE_API_TOKEN 和 CLOUDFLARE_ACCOUNT_ID。
# 创建 D1 与 R2（若已存在则沿用），写入 database_id，迁移，构建页面，部署到自定义域名，写入测试用密钥，并等待种子数据。
set -euo pipefail
cd "$(dirname "$0")/.."

EXPECTED_ACCOUNT="d0e845fde248a912a971bdeb055c6bd4"
DB_NAME="guoxie-yungong"
BUCKET="guoxie-yungong-files"
ORIGIN="https://guoxie.chang2.ccwu.cc"
# 仅供测试。上线真实人员前必须轮换。
PEPPER="guoxie-test-pepper-change-me"
ESIGN_SECRET="guoxie-test-esign-webhook"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "请设置 CLOUDFLARE_API_TOKEN 和 CLOUDFLARE_ACCOUNT_ID。未设置时不会调用 Cloudflare。"
  exit 1
fi
if [[ "$CLOUDFLARE_ACCOUNT_ID" != "$EXPECTED_ACCOUNT" ]]; then
  echo "CLOUDFLARE_ACCOUNT_ID 必须是 ${EXPECTED_ACCOUNT}。已停止，没有调用部署。"
  exit 1
fi

export CI=1
cd apps/api

echo "检查 D1 数据库 ${DB_NAME}"
LIST_JSON="$(npx wrangler d1 list --json)"
DB_ID="$(node --input-type=module -e '
const payload = JSON.parse(process.argv[1]);
const rows = Array.isArray(payload) ? payload : payload.result || payload.databases || [];
const found = rows.find((row) => row.name === process.argv[2] || row.database_name === process.argv[2]);
process.stdout.write(found?.uuid || found?.database_id || "");
' "$LIST_JSON" "$DB_NAME")"

if [[ -z "$DB_ID" ]]; then
  echo "创建 D1 数据库 ${DB_NAME}"
  CREATE_OUT="$(npx wrangler d1 create "$DB_NAME" --location apac)"
  DB_ID="$(node -e 'const match = process.argv[1].match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i); if (match) process.stdout.write(match[0]);' "$CREATE_OUT")"
fi
if [[ -z "$DB_ID" || "$DB_ID" == "00000000-0000-0000-0000-000000000000" ]]; then
  echo "没有拿到 D1 database_id，已停止。"
  exit 1
fi
echo "使用 D1 ${DB_ID}"
node --input-type=module -e '
import fs from "node:fs";
const file = "wrangler.jsonc";
const id = process.argv[1];
const text = fs.readFileSync(file, "utf8").replaceAll(/"database_id": "[^"]+"/g, `"database_id": "${id}"`);
fs.writeFileSync(file, text);
' "$DB_ID"

echo "检查 R2 桶 ${BUCKET}"
set +e
BUCKET_OUT="$(npx wrangler r2 bucket create "$BUCKET" 2>&1)"
BUCKET_CODE=$?
set -e
if [[ $BUCKET_CODE -ne 0 ]]; then
  if printf '%s' "$BUCKET_OUT" | grep -qi -e "already exists" -e "已存在"; then
    echo "R2 桶已存在"
  else
    printf '%s\n' "$BUCKET_OUT"
    exit 1
  fi
fi

cd ../..
echo "构建页面"
npm --prefix apps/web run build

cd apps/api
echo "执行远程迁移"
npx wrangler d1 migrations apply DB --remote --env prod
echo "部署 Worker 与自定义域名 ${ORIGIN}"
npx wrangler deploy --env prod
printf '%s' "$PEPPER" | npx wrangler secret put SESSION_PEPPER --env prod
printf '%s' "$ESIGN_SECRET" | npx wrangler secret put ESIGN_WEBHOOK_SECRET --env prod

echo "等待 ${ORIGIN} 完成种子数据"
ok=0
for _ in $(seq 1 36); do
  body="$(curl -fsS "${ORIGIN}/api/health" 2>/dev/null || true)"
  printf '%s\n' "$body"
  if printf '%s' "$body" | grep -q '"seeded":true'; then
    ok=1
    break
  fi
  sleep 10
done
if [[ $ok -ne 1 ]]; then
  echo "健康检查没有在限定次数内返回 seeded:true。请确认自定义域名已经生效。不要改用 workers.dev。"
  exit 1
fi

login_ok() {
  local email="$1"
  local password="$2"
  local code
  code="$(curl -sS -o /tmp/guoxie-login.json -w '%{http_code}' -X POST "${ORIGIN}/api/auth/login" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\"}")"
  if [[ "$code" != "200" ]] || ! grep -q '"token"' /tmp/guoxie-login.json; then
    echo "登录失败：${email} HTTP ${code}"
    exit 1
  fi
  echo "登录成功：${email}"
}

login_ok "maker@guoxie.chang2.ccwu.cc" "Test-only-Maker-2026"
login_ok "checker@guoxie.chang2.ccwu.cc" "Test-only-Checker-2026"
login_ok "employee@guoxie.chang2.ccwu.cc" "Test-only-Employee-2026"
login_ok "collaborator@guoxie.chang2.ccwu.cc" "Test-only-Collaborator-2026"
disabled="$(curl -sS -o /tmp/guoxie-disabled.json -w '%{http_code}' -X POST "${ORIGIN}/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"hemu@guoxie.chang2.ccwu.cc","password":"Test-only-Terminated-2026"}')"
if [[ "$disabled" != "403" ]]; then
  echo "已终止账号何牧应当无法登录，实际 HTTP ${disabled}"
  exit 1
fi
rm -f /tmp/guoxie-login.json /tmp/guoxie-disabled.json
echo "部署完成：${ORIGIN}"
