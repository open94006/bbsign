# BB Sign 運動報名資訊網

把台灣的路跑、自行車、三鐵賽事整理在同一頁：點地圖上的縣市 → 看賽事 → 看比賽日、距離、報名費、紀念品與標籤 → 一鍵前往報名。

## 架構

| 部分 | 內容 |
|---|---|
| `frontend/` | Vite + React + TypeScript；地圖用 `taiwan-atlas` + `d3-geo`；`/admin` 是管理頁 |
| `backend/main.py` | FastAPI：`GET /api/events`（全部未來賽事，篩選在前端做）、`/api/admin/*`（管理頁用） |
| `backend/crawl/` | 每個來源一支爬蟲 → `normalize.py` 用 Claude Haiku 抽成統一欄位 → 寫入資料庫 |
| 資料庫 | Neon PostgreSQL，單表 `events`（`backend/schema.sql`，啟動時自動建立） |
| 快取 | Upstash Redis：快取 `/api/events`、限制管理頁登入失敗次數 |

### 資料來源

| 來源 | 抓法 |
|---|---|
| 全統運動 | 首頁卡片 + 「活動簡章」分頁 |
| 中華民國路跑協會 | 年度賽程表（今年＋明年） |
| 筆記報名 | `/list` + 內頁；海外賽由 AI 判斷縣市後濾掉 |
| 樂活報名網 | `signup.lohasnet.tw/lohasnet/index` JSON + 活動網站 |
| 眾點資訊 | `/api/act` JSON + 活動簡章 API |
| 運動筆記 | 「找賽事」行事曆 + 內頁。報名連結指向上面 5 站的略過；其他平台（伊貝特等）直接連過去；還沒有報名連結的先連運動筆記的賽事頁 |
| 伊貝特 | 有人機驗證，不直接抓；賽事從運動筆記行事曆取得 |

爬蟲每個網域每秒最多 1 個請求、遵守 robots.txt。內頁文字沒變就不會重新呼叫 AI。

## 本機開發

```bash
# 1. 資料庫與 Redis
docker run -d --name bbsign-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=bbsign -p 54329:5432 postgres:17-alpine
docker run -d --name bbsign-redis -p 63799:6379 redis:7-alpine

# 2. 後端（Python 3.10 以上）
cd backend
python3.13 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env   # 填入本機的值
set -a; source .env; set +a
.venv/bin/uvicorn main:app --reload --port 8000

# 3. 前端（另開終端機），/api 會轉到 8000 埠
cd frontend && npm install && npm run dev
```

### 爬蟲

```bash
cd backend && set -a; source .env; set +a
.venv/bin/python -m crawl.run --dry > raw.jsonl   # 只抓不寫，檢查每站都抓得到
.venv/bin/python -m crawl.run                     # 抓取 → AI 正規化 → 寫入資料庫（需要 ANTHROPIC_API_KEY）
.venv/bin/python -m crawl.run biji ctrun          # 只跑指定來源
.venv/bin/python -m crawl.run --new               # 只處理資料庫還沒有的新賽事
.venv/bin/python test_crawl.py                    # 鎖定保護與 AI 抽取的自我檢查
```

### 管理頁

開 `/admin`，輸入 `ADMIN_TOKEN`。

- 改過的賽事會鎖定，之後爬蟲不會覆蓋。
- 不想顯示的賽事請勾「隱藏」，不要刪除，否則隔天爬蟲又會加回來。
- 自行車、三鐵這類爬不到的比賽，可以在這裡手動新增。

## 部署到 Google Cloud Run

同一個映像檔有兩種用途：服務（網站＋API）和定期執行的爬蟲工作。

- 地區建議 `asia-east1`（彰化）。
- Neon 選 `ap-southeast-1`（新加坡）。
- Upstash 選東京或新加坡。

```bash
PROJECT=你的專案 ID
REGION=asia-east1

# 機密放 Secret Manager（每個值各建一次）
printf '%s' 'postgresql://…-pooler…' | gcloud secrets create bbsign-database-url --data-file=-
printf '%s' 'rediss://…'              | gcloud secrets create bbsign-redis-url --data-file=-
printf '%s' 'sk-ant-…'                | gcloud secrets create bbsign-anthropic-key --data-file=-
printf '%s' "$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')" | gcloud secrets create bbsign-admin-token --data-file=-

# 網站與 API
gcloud run deploy bbsign --source . --region $REGION --allow-unauthenticated \
  --set-secrets DATABASE_URL=bbsign-database-url:latest,REDIS_URL=bbsign-redis-url:latest,ADMIN_TOKEN=bbsign-admin-token:latest

# 爬蟲工作
gcloud run jobs deploy bbsign-crawl --source . --region $REGION \
  --command python --args=-m,crawl.run --task-timeout 30m --max-retries 0 \
  --set-secrets DATABASE_URL=bbsign-database-url:latest,REDIS_URL=bbsign-redis-url:latest,ANTHROPIC_API_KEY=bbsign-anthropic-key:latest

# 排程（服務帳戶需要 roles/run.invoker）
JOB_URI="https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/bbsign-crawl:run"
SA=服務帳戶@$PROJECT.iam.gserviceaccount.com

# 每 3 天凌晨 3 點：只抓資料庫還沒有的新賽事（每月 1、4、7…日，月底到月初可能只隔 1–2 天）
gcloud scheduler jobs create http bbsign-crawl-new --location $REGION \
  --schedule "0 3 */3 * *" --time-zone Asia/Taipei --http-method POST --uri "$JOB_URI" \
  --message-body '{"overrides":{"containerOverrides":[{"args":["-m","crawl.run","--new"]}]}}' \
  --oauth-service-account-email $SA

# 每週一凌晨 4 點：完整更新所有未截止的賽事（內容有變才重抽）
gcloud scheduler jobs create http bbsign-crawl-weekly --location $REGION \
  --schedule "0 4 * * 1" --time-zone Asia/Taipei --http-method POST --uri "$JOB_URI" \
  --oauth-service-account-email $SA

# 之前建過每天執行的排程就刪掉
gcloud scheduler jobs delete bbsign-crawl-daily --location $REGION
```

## 已知限制

- **同一場賽事可能出現多張卡片**：
  - 同一場出現在兩個來源時，會各自成為一張卡。
  - 同一來源把一場賽事拆成「國內組／國際組」時，也會分成多張。
  - 之後可依「日期＋縣市＋名稱相似度」合併。
- **搜尋引擎抓不太到內容**：網站是單頁應用，對搜尋引擎不友善。要搶「XX馬拉松 報名」這類搜尋流量時，再為每場賽事預先產生靜態頁面。
- **公開 API 有 5 分鐘瀏覽器快取**：在管理頁存檔後，前台最多要 5 分鐘才會看到更新。
