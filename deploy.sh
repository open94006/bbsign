#!/usr/bin/env bash
# 部署到 Google Cloud Run：網站服務 + 爬蟲 Job + 兩個排程。可重複執行。
# 第一次執行時用環境變數帶入機密（ADMIN_TOKEN 沒帶會自動產生），之後直接 ./deploy.sh 只更新程式：
# DATABASE_URL='postgresql://…-pooler…' 
# REDIS_URL='rediss://…'
# ANTHROPIC_API_KEY='sk-ant-…' ./deploy.sh
# 要換某個機密時，只帶那個變數再跑一次即可。
set -euo pipefail

export CLOUDSDK_CORE_PROJECT=${PROJECT:-$(gcloud config get-value project 2>/dev/null)}
[ -n "$CLOUDSDK_CORE_PROJECT" ] || { echo "請設定 PROJECT=… 或執行 gcloud config set project"; exit 1; }
PROJECT=$CLOUDSDK_CORE_PROJECT
REGION=${REGION:-asia-east1}
# ponytail: 服務、Job、排程共用一個服務帳戶；要更嚴格的權限隔離再拆成三個
SA=bbsign@$PROJECT.iam.gserviceaccount.com

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com cloudscheduler.googleapis.com
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 ||
  gcloud iam service-accounts create bbsign --display-name "BB Sign"

# secret 名稱 值：有值就寫入新版本；不存在又沒給值就停下
secret() {
  if ! gcloud secrets describe "$1" >/dev/null 2>&1; then
    [ -n "$2" ] || { echo "缺少機密 $1，第一次部署請用環境變數帶入（見檔案開頭）"; exit 1; }
    gcloud secrets create "$1" --replication-policy automatic
  fi
  [ -z "$2" ] || printf '%s' "$2" | gcloud secrets versions add "$1" --data-file=-
  gcloud secrets add-iam-policy-binding "$1" --member "serviceAccount:$SA" \
    --role roles/secretmanager.secretAccessor >/dev/null
}
gcloud secrets describe bbsign-admin-token >/dev/null 2>&1 ||
  ADMIN_TOKEN=${ADMIN_TOKEN:-$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')}
secret bbsign-database-url "${DATABASE_URL:-}"
secret bbsign-redis-url "${REDIS_URL:-}"
secret bbsign-anthropic-key "${ANTHROPIC_API_KEY:-}"
secret bbsign-admin-token "${ADMIN_TOKEN:-}"
DB=DATABASE_URL=bbsign-database-url:latest,REDIS_URL=bbsign-redis-url:latest

# 網站與 API（建置一次映像檔，Job 直接沿用）
gcloud run deploy bbsign --source . --region "$REGION" --allow-unauthenticated \
  --service-account "$SA" --set-secrets "$DB,ADMIN_TOKEN=bbsign-admin-token:latest"
IMAGE=$(gcloud run services describe bbsign --region "$REGION" --format 'value(spec.template.spec.containers[0].image)')

# 爬蟲工作
gcloud run jobs deploy bbsign-crawl --image "$IMAGE" --region "$REGION" --service-account "$SA" \
  --command python --args=-m,crawl.run --task-timeout 30m --max-retries 0 \
  --set-secrets "$DB,ANTHROPIC_API_KEY=bbsign-anthropic-key:latest"
gcloud run jobs add-iam-policy-binding bbsign-crawl --region "$REGION" \
  --member "serviceAccount:$SA" --role roles/run.invoker >/dev/null

# 排程：已存在就更新，不存在就建立
JOB_URI="https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/bbsign-crawl:run"
schedule() {
  local name=$1; shift
  local op=create
  gcloud scheduler jobs describe "$name" --location "$REGION" >/dev/null 2>&1 && op=update
  gcloud scheduler jobs $op http "$name" --location "$REGION" --time-zone Asia/Taipei \
    --http-method POST --uri "$JOB_URI" --oauth-service-account-email "$SA" "$@"
}
# 每 3 天凌晨 3 點：只抓資料庫還沒有的新賽事（每月 1、4、7…日，月底到月初可能只隔 1–2 天）
schedule bbsign-crawl-new --schedule "0 3 */3 * *" \
  --message-body '{"overrides":{"containerOverrides":[{"args":["-m","crawl.run","--new"]}]}}'
# 每週一凌晨 4 點：完整更新所有未截止的賽事（內容有變才重抽）
schedule bbsign-crawl-weekly --schedule "0 4 * * 1"

echo
echo "網站：$(gcloud run services describe bbsign --region "$REGION" --format 'value(status.url)')"
echo "管理密碼：gcloud secrets versions access latest --secret bbsign-admin-token"
echo "立即爬一次：gcloud run jobs execute bbsign-crawl --region $REGION"
