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

第一次部署時，用環境變數帶入機密。`ADMIN_TOKEN` 沒帶的話會自動產生：

```bash
PROJECT=你的專案ID DATABASE_URL='postgresql://…-pooler…' REDIS_URL='rediss://…' ANTHROPIC_API_KEY='sk-ant-…' ./deploy.sh
```

[deploy.sh](deploy.sh) 會依序完成以下工作：

- 啟用需要的 API
- 建立服務帳戶 `bbsign`
- 把機密寫進 Secret Manager
- 部署網站服務與爬蟲 Job（共用同一個映像檔）
- 建立兩個排程：每 3 天抓一次新賽事、每週一完整更新

之後更新程式碼時，直接執行 `./deploy.sh` 即可。要更換某個機密，只帶那個變數再執行一次。

### push 自動部署（Cloud Build）

[cloudbuild.yaml](cloudbuild.yaml) 會建置映像檔，並部署網站服務與爬蟲 Job。也會建立兩個排程：每 3 天抓一次新賽事、每週一完整更新未截止的賽事。管理頁的「只抓新賽事／完整更新」按鈕可以隨時手動啟動。

一次性設定：

1. 在 Cloud Run 主控台替服務 `bbsign` 設定 `ADMIN_TOKEN`，以及從 Secret Manager 帶入的 `DATABASE_URL`、`REDIS_URL`。爬蟲 Job 用的機密名稱寫在 `cloudbuild.yaml`（`BBSIGN_DATABASE_URL`、`UPSTASH_REDIS_URL`、`BBSIGN_ANTHROPIC_API_KEY`）。
2. Cloud Build 觸發條件的設定檔要選 `cloudbuild.yaml`。從 Cloud Run 主控台「持續部署」建立的觸發條件預設是內嵌設定，只會換映像檔，要改成這個檔案：
   `gcloud builds triggers update github <觸發條件名稱> --build-config=cloudbuild.yaml`
3. 服務、Job 與建置都用 Compute 預設服務帳戶，它需要 `Cloud Run 管理員`、`服務帳戶使用者`、`Artifact Registry 寫入者`、`Secret Manager 存取者`。
4. 映像檔放在 Artifact Registry 的 `cloud-run-source-deploy`，沒有的話先建立：

```bash
gcloud artifacts repositories create cloud-run-source-deploy --repository-format docker --location asia-east1
```

## 已知限制

- **同一場賽事可能出現多張卡片**：
  - 同一場出現在兩個來源時，會各自成為一張卡。
  - 同一來源把一場賽事拆成「國內組／國際組」時，也會分成多張。
  - 之後可依「日期＋縣市＋名稱相似度」合併。
- **搜尋引擎抓不太到內容**：網站是單頁應用，對搜尋引擎不友善。要搶「XX馬拉松 報名」這類搜尋流量時，再為每場賽事預先產生靜態頁面。
- **公開 API 有 5 分鐘瀏覽器快取**：在管理頁存檔後，前台最多要 5 分鐘才會看到更新。
