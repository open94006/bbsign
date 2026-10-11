# z-running 整併進 BB Sign 規劃書

2026-10-11

## 1. 目標與範圍

**一句話**：BB Sign 從「賽事清單」延伸成「跑者的賽前工具」——找到賽事 → 看比賽日天氣 → 算目標配速 → 平常每天看能不能練跑。

| 項目 | 處理方式 | 落點 |
| --- | --- | --- |
| 跑步天氣（WeatherChecker） | 搬入，核心功能 | `/weather`、賽事展開區 |
| 配速／VDOT（RunningCalculator + VDOT） | 搬入 | `/pace`、賽事展開區 |
| 羽球記分板 | 搬入「小工具」區 | `/tools/badminton` |
| 球速換算、重量換算 | 搬入「小工具」區，合成一頁兩區塊 | `/tools/convert` |
| `client/src/lib/` 三支純函式 + 測試 | 原樣搬 | `frontend/src/lib/` |
| Express server | 不搬，改寫成 FastAPI 一支檔案 | `backend/weather.py` |
| OpenWeatherMap、Nominatim／Google／OpenCage 地理編碼 | 不搬，只做台灣，CWA + MOENV 足夠 | — |
| z-running `components/ui/`、UiKit、ThemeToggle、Tailwind | 不搬，一律用 BB Sign 設計系統 | — |
| seo.service、product.\*、react-router | 不搬 | — |

**不在這次範圍**：會員登入、收藏同步、推播、PLAYGROUND 的買午餐。

## 2. 兩邊現況對照

| | z-running | BB Sign（整併後沿用） |
| --- | --- | --- |
| 後端 | Express 5 · TS，天氣代理 | FastAPI · Python 3.13 |
| 前端路由 | react-router 7 | `main.tsx` 依 pathname 分流 + `lazy()` |
| 樣式 | Tailwind v4 + 自建 15 個元件 | `tokens.css` + `components.css`（`bb-btn`、`bb-chip`…）；Tailwind/shadcn 只在 `/admin` |
| 設計 | Hallmark editorial「Sport」，亮/暗兩套 | Hallmark atmospheric「破曉起跑」，只有暗色 |
| 快取 | 記憶體（多台 Cloud Run 各自一份） | Upstash Redis，key 前綴 `bb:` |
| 測試 | vitest | 後端 assert 自我檢查（`test_crawl.py`）；前端尚無 |
| 部署 | 前後端兩個容器 + Caddy | 單一容器（Cloud Run 服務 + Job） |

## 3. 整併後的樹狀結構

`＋` 新增、`～` 修改

```
bbsign/
├── backend/
│   ├── main.py              ～ include weather router
│   ├── weather.py           ＋ CWA／MOENV 代理、最近測站、Redis 快取（約 150 行）
│   ├── test_weather.py      ＋ assert 自我檢查
│   └── .env.example         ～ CWA_API_KEY、MOENV_API_KEY
├── frontend/
│   ├── package.json         ～ + suncalc、vitest；scripts.test
│   ├── public/sitemap.xml   ～ + /weather /pace /tools
│   └── src/
│       ├── main.tsx         ～ pathname → lazy 頁面對照表
│       ├── tokens.css       ～ + 跑步狀況四級色（同步 tokens.json）
│       ├── Page.tsx         ＋ 子頁共用外框：頁首導覽、標題、頁尾，並更新 title／description／canonical
│       ├── pages.css        ＋ 新頁面共用樣式，跟著 lazy chunk 載入，不影響首頁
│       ├── App.tsx          ～ 頁首／頁尾加「跑步天氣・配速・小工具」入口
│       ├── RaceRow.tsx      ～ 展開區掛 <RaceWeather>、配速連結
│       ├── lib/
│       │   ├── runningCondition.ts (+ .test.ts)  ＋ 原樣搬
│       │   ├── runnerAdvice.ts     (+ .test.ts)  ＋ 原樣搬
│       │   └── sunTimes.ts         (+ .test.ts)  ＋ 原樣搬
│       ├── weather/
│       │   ├── WeatherPage.tsx   ＋ /weather
│       │   └── RaceWeather.tsx   ＋ 賽事展開區的比賽日天氣
│       ├── pace/
│       │   └── PacePage.tsx      ＋ /pace
│       └── tools/
│           ├── ToolsPage.tsx     ＋ /tools 目錄
│           ├── Badminton.tsx     ＋ /tools/badminton
│           └── Converter.tsx     ＋ /tools/convert（球速 + 重量）
├── cloudbuild.yaml          ～ --set-secrets 加兩把金鑰
├── deploy.sh                ～ secret() 加兩把金鑰
└── README.md                ～ 架構表、資料來源補天氣
```

## 4. 後端設計（`backend/weather.py`）

### 4.1 端點

| 端點 | 用途 |
| --- | --- |
| `GET /api/weather?lat=&lon=` | 現在天氣 + 未來 6 小時 + AQI + UV（GPS 模式） |
| `GET /api/weather?county=臺北市` | 同上，用縣市代表座標（22 筆常數，縣市政府所在地）走同一條最近測站邏輯 |
| `GET /api/weather/week?county=臺北市` | 一週逐 12 小時預報，給賽事比賽日用 |

本機測試：`python test_weather.py`（有 `CWA_API_KEY`、`MOENV_API_KEY` 才會實際打上游）。

### 4.2 資料來源與快取

上游只打**固定的資料集網址**，使用者的座標只用來在快取裡挑測站；縣市參數先過 22 縣市白名單才用來篩選預報。

| 資料集 | 用途 | Redis key | TTL |
| --- | --- | --- | --- |
| CWA `O-A0001-001` 自動氣象站（876 站） | 現在溫度、濕度、風速、風向角度、氣壓、天氣現象 | `bb:wx:obs`（只存需要的欄位） | 10 分 |
| CWA `F-D0047-089` 縣市未來 3 天 | 6 小時趨勢：溫度與體感**逐 1 小時**，降雨機率逐 3 小時 | `bb:wx:3d:<縣市>` | 30 分 |
| CWA `F-D0047-091` 縣市未來 1 週逐 12 小時 | 比賽日天氣、UV | `bb:wx:week:<縣市>` | 60 分 |
| MOENV `aqx_p_432`（84 站） | AQI、PM2.5 | `bb:wx:aqi` | 20 分 |

- 預報用 `LocationName=<縣市>` 篩選，一次約 54 KB；抓全台會到 1 MB，存進 Upstash 太大。縣市有白名單，上游呼叫最多 22 × 2 次／TTL。
- 沒設 `REDIS_URL`（本機）就每次直接抓，與 `/api/events` 同樣的寫法。
- `db.clear_cache()` 只刪 `bb:events`，爬蟲跑完不會清掉天氣快取。
- 回應帶 `Cache-Control: public, max-age=300`。

### 4.3 回應格式

沿用 z-running `WeatherData` 介面，讓 WeatherChecker 的邏輯搬過來時改動最少：

- 刪掉 OWM 才有的欄位：`icon` 改成 CWA `WeatherCode` + 天氣現象文字；`visibility` 刪除；`airQuality.components` 只留 `pm2_5`、`pm10`、`o3`。
- **AQI 維持 1–5 級**：`runningCondition.ts` 吃的是 OWM 的 1–5 尺度，`convertMoenvAqiToLevel` 跟著搬到 Python。
- **風速單位 km/h**：lib 的門檻是 km/h，CWA 給 m/s，後端乘 3.6。
- `windDeg`：測站有 `WindDirection`（角度），直接帶出。
- `feelsLike`：用 089 當小時的體感溫度（縣市層級）。
- 6 小時趨勢不用再像 z-running 那樣在 3 小時錨點間內插，089 的溫度本來就是逐小時。

### 4.4 P0 驗證結果（2026-10-11）

| 項目 | 結果 |
| --- | --- |
| CWA、MOENV 連線 | ⚠️ Python 3.13 預設 `VERIFY_X509_STRICT`，兩站的政府憑證缺 Subject Key Identifier 會被擋。**解法**：certifi + 只清掉 strict 旗標；已驗證過期、主機名稱不符、自簽憑證仍會被拒。**不能用 `verify=False`**。 |
| `O-A0001-001` | ✅ 876 站，22 縣市都有（連江 4、金門 6、澎湖 9），座標有 WGS84。約 3–4% 的站某些欄位是 `-99`，挑最近測站時要跳過缺值的站。 |
| `F-D0047-089` | ✅ 縣市層級（22 筆），`LocationName` 篩選有效。溫度、露點、濕度、體感前 1–2 天逐小時、之後逐 3 小時；降雨機率、天氣現象、風速、風向逐 3 小時。 |
| `F-D0047-091` | ✅ 縣市層級，一週逐 12 小時，含最高最低溫、體感、UV（只有白天時段）。⚠️ **降雨機率只有前 3 天**，第 4–7 天是「-」，API 回 `null`，前端要顯示「降雨機率尚未公布」。 |
| MOENV `aqx_p_432` | ✅ 84 站，有經緯度、`aqi`、`pm2.5`、`status`，AQI 無缺值。 |
| 結論 | **OpenWeatherMap 可以完全拿掉**，不需要備援。 |

### 4.6 鄉鎮層級預報（2026-10-11 追加）

預報從縣市層級（`F-D0047-089`／`-091`）改成鄉鎮層級：每個縣市有自己的資料集，3 天預報是 `F-D0047-001`、`-005`…`-085`（奇數），1 週是 3 天的編號 +2，對照寫在 `COUNTIES`。全台 368 個鄉鎮。

| 項目 | 做法 |
| --- | --- |
| 鄉鎮清單與座標 | 1 週資料集只抓「最高溫度」一個元素（整個縣市幾十 KB），快取 `bb:wx:towns:<縣市>` 一天 |
| 預報 | 依 `LocationName=<鄉鎮>` 單獨抓（整個縣市最大 1.7 MB），快取 `bb:wx:3d:<縣市>:<鄉鎮>` 30 分、`bb:wx:week:<縣市>:<鄉鎮>` 60 分 |
| 選鄉鎮 | `town` 要在該縣市的鄉鎮清單內；不在就當沒給，用縣市政府所在地最近的鄉鎮 |
| 定位 | 最近測站決定縣市，再挑縣市內最近的鄉鎮 |
| 賽事 | `/api/weather/week?county=&venue=`：從地點文字比對鄉鎮，先比完整名稱（苓雅區）再比去掉區鄉鎮市的名稱（苓雅），取最早出現的；本機 224 場有 163 場比對到，其餘（地標名稱）用縣市政府所在地 |
| 剛發布時 | 鄉鎮預報第一筆從下一個整點開始，「現在」查不到的欄位用下一個整點的值 |

### 4.5 安全

- 使用者輸入不進上游 URL → 流量再大，上游呼叫次數都固定（資料集數 ÷ TTL），金鑰不會被刷爆，不需要另外限流。
- `lat`/`lon` 必須在台灣範圍（含澎金馬，沿用 `isLocationInTaiwan`），否則回 400；`county` 必須在 22 縣市白名單內。
- 全部走同源 `/api`，CSP 不用改。瀏覽器定位只在使用者按「用我的位置」時才要求。
- CWA 金鑰用 `Authorization` header 傳，不出現在網址；MOENV 只收網址參數，所以上游錯誤 log 只記例外類型與狀態碼，不記訊息。
- 前端送 GPS 座標前四捨五入到小數 2 位（約 1 公里），Cloud Run 請求記錄不會留下精確位置；挑最近測站不需要更精確。
- 上游失敗回 503，前端顯示「天氣暫時無法取得」。<!-- ponytail: 不做 stale-on-error，CWA 常維護再加 -->

## 5. 前端設計

### 5.1 路由

不引入 react-router，延用 `main.tsx` 現有的 pathname 分流：

```tsx
const PAGES: Record<string, LazyExoticComponent<() => JSX.Element>> = {
  '/admin': lazy(() => import('./Admin.tsx')),
  '/weather': lazy(() => import('./weather/WeatherPage.tsx')),
  '/pace': lazy(() => import('./pace/PacePage.tsx')),
  '/tools': lazy(() => import('./tools/ToolsPage.tsx')),
  '/tools/badminton': lazy(() => import('./tools/Badminton.tsx')),
  '/tools/convert': lazy(() => import('./tools/Converter.tsx')),
}
```

頁面之間用一般 `<a href>` 連結；FastAPI 的 SPA fallback 已經能處理這些路徑。每頁在自己的 `useEffect` 設 `document.title` 與 meta description。

### 5.2 `/weather` 跑步天氣

從 WeatherChecker（1181 行）**只搬邏輯，JSX 用 BB Sign 樣式重寫**：

- 進場用上次選的縣市（localStorage），沒有就臺北市；另有「用我的位置」按鈕。
- 跑步指數大數字 + 等級，「現在 vs 3 小時後」對照。
- 6 小時趨勢，標出最佳時段（`pickBestSlotIndex`）。
- 穿著、補水、風向建議（`runnerAdvice`），日出日落（`sunTimes`）。
- 跑者設定：只留怕熱／普通／怕冷（存 localStorage）。VDOT 訓練配速移到 `/pace`，不在兩頁重複。
- 拿掉的：地名搜尋（改成縣市選單 + GPS）、收藏多個地點（只記上次縣市，有需求再加回來）。

### 5.3 `/pace` 配速

- 輸入距離（5K／10K／半馬／全馬／自訂）和目標（完賽時間或每公里配速，兩種輸入可切換），即時算出配速、完賽時間、VDOT、三種訓練配速 E／T／I（`getTrainingPaces`）。配速在每公里 2:30–15:00 之外不換算（Daniels 公式不可信）。
- 參數放 URL：`/pace?d=21.0975&t=2:00:00`，可分享，也讓賽事頁直接帶入。

### 5.4 跟賽事接起來（`RaceRow` 展開區）

這是整併真正的價值：

- **比賽天氣** `<RaceWeather>`：詳細卡 `bb-facts` 多一列。`race_date` 在 6 天內、而且卡片展開過才抓 `/api/weather/week?county=`，取比賽日白天那段：天氣、溫度範圍、降雨機率（第 4 天起顯示「尚未公布」）、紫外線、熱壓力提醒（白天最高溫＋露點）。超過 6 天顯示「比賽前一週會出現天氣預報」，不發請求。路跑、自行車、三鐵都顯示。
- **算配速**：路跑賽事的詳細卡多一列，每個距離一個連結到 `/pace?d=<距離>`。不在清單內嵌計算機，避免抽屜變擠。
- 標示「縣市預報；山區、越野賽的實際溫度可能更低」。

### 5.5 `/tools` 小工具

- `/tools` 目錄頁列出兩個工具；入口放頁尾，不打斷賽事主流程。
- **羽球記分板**：規則抽成純函式 `tools/badminton.ts`（附 vitest），畫面重寫。保留單雙打、雙打發球輪轉、上一步、改球員名字、localStorage 續局（3 小時）；新增 Screen Wake Lock，比賽中螢幕不休眠。修掉原版兩個問題：局數在確認前就加上、取消後還能繼續加分；每局重設會把自訂名字洗回 A1、A2。手機直放、橫放都能一眼看完不用捲。確認對話框用原生 `confirm()`，規則用 `<details>`。
- **換算**：球速 mph↔km/h、重量 kg↔lb，同一頁兩區塊，改哪邊算哪邊；係數用國際定義值（1 mi = 1.609344 km、1 lb = 0.45359237 kg）。

### 5.6 設計系統

- 只用 BB Sign 的 `tokens.css` + `components.css`；公開頁不用 shadcn（shadcn 維持只在 `/admin` 的 chunk）。
- `tokens.css` 新增跑步狀況四級色 `--cond-excellent/good/fair/poor`，對應 lib 的 `level`；不和唯一強調色 `--sunrise` 混用。設計規範的 tokens.json 不在這個 repo，要另外同步。
- lib 回傳的 `color`、`emoji`、`brightness` 是 z-running 的 Tailwind 遺留，P3 已拿掉；畫面用 `level` 對應 `--cond-*`。
- BB Sign 只有暗色，不搬 ThemeToggle。
- 新頁面要符合現有規範：手機 16px 邊距、不能水平捲動、`focus-visible` 樣式、按鈕要有 aria-label。

## 6. 測試

| 層 | 做法 | 通過條件 |
| --- | --- | --- |
| 前端 lib | 加 `vitest`，`npm test` | z-running 三支測試原樣全過 = 搬運正確 |
| 後端 | `test_weather.py`，assert 風格同 `test_crawl.py` | 最近測站、台灣範圍驗證、AQI 轉級、縣市白名單 |
| 頁面 | preview 實際操作 | 手機寬度；拒絕 GPS 有提示；上游 503 有提示；賽事展開區 6 天內/外兩種狀態 |

## 7. 部署與 z-running 下線

1. ✅ Secret Manager 的 `CWA_API_KEY`、`MOENV_API_KEY` 由 `cloudbuild.yaml` 以 `--update-secrets` 帶入 bbsign 服務。
   - `cloudbuild.yaml`（`BBSIGN_*`）與 `deploy.sh`（`bbsign-*`）的 secret 命名仍不一致，`deploy.sh` 是早期第一次部署用的腳本。
2. ✅ `sitemap.xml` 加 `/weather`、`/pace`、`/tools`、`/tools/badminton`、`/tools/convert`。
3. z-running.com **直接停用，不做 301**（2026-10-11 決定）。曾在 `main.py` 寫過依 Host 轉址的 middleware，決定停用網域後已刪除；z-running.com 原有的搜尋排名與書籤流量不會導到 BB Sign。
4. 停用 z-running 時：刪 Cloud Run 服務、Cloud Build 觸發條件、網域對應（與 Artifact Registry 映像檔），撤銷 OpenWeatherMap、Google Maps、OpenCage 金鑰。
   - **不要刪 `CWA_API_KEY`、`MOENV_API_KEY` 這兩個 secret**，BB Sign 正在用；只刪 `OPENWEATHER_API_KEY`。

## 8. 階段

每個階段一個 commit，各自可上線。

| 階段 | 內容 | 規模 | 完成條件 |
| --- | --- | --- | --- |
| **P0** 驗證資料源 ✅ | 用金鑰實際打 CWA 三個資料集 + MOENV，確認能取代 OWM（結果見 4.4） | S | 溫度、濕度、風速風向、體感、降雨機率、UV、逐 3 小時都拿得到；拿不到的欄位只留 OWM 當單一備援 |
| **P1** 後端 ✅ | `weather.py` + `test_weather.py` | M | 兩個端點回正確資料；離線與上游實測都通過；Redis 快取命中 0.02 秒 |
| **P2** 骨架 ✅ | lib 搬入、vitest 5（bbsign 是 vite 8）、`main.tsx` 路由、共用外框 `Page.tsx` + `pages.css`、狀況色 token | S | `npm test` 49 項全過；各路徑能開；首頁不載入子頁樣式 |
| **P3** `/weather` ✅ | 跑步天氣頁；lib 拿掉 `color`／`emoji`／`brightness` 遺留欄位 | L | 縣市與 GPS 兩種模式；定位被拒、上游 503 有提示；手機排版通過 |
| **P4** `/pace` + 賽事整合 ✅ | 配速頁、`RaceWeather`、配速連結 | M | 6 天內的賽事顯示比賽日天氣；超過 6 天不發請求；連結帶入距離 |
| **P5** `/tools` ✅ | 羽球記分板、換算 | M | 記分板重整後能續局、螢幕不休眠；手機直放橫放一屏看完 |
| **P6** 上線 ✅ | 全站導覽（首頁右上角也有）；sitemap、README；`cloudbuild.yaml` 用 `--update-secrets` 帶入 `CWA_API_KEY`、`MOENV_API_KEY`；已合併 main 並部署。z-running.com 直接停用，不做 301 | S | 正式站 `/weather` 有資料 |
| P7（可選） | 地圖點縣市時顯示今日跑步指數 | M | P1–P6 穩定再評估 |

## 9. 風險

| 風險 | 對策 |
| --- | --- |
| CWA 欄位不足以完全取代 OWM | P0 已驗證足夠 |
| Python 3.13 對政府憑證驗證失敗 | 自訂 SSL context，只放寬 strict 旗標（見 4.4） |
| CWA／MOENV 維護或限流 | 整包快取，使用者流量不會打到上游；失敗時前端顯示 Notice |
| 預報解析度 | 已改成鄉鎮層級（見 4.6）；賽事地點比對不到鄉鎮時標示用了哪個鄉鎮的預報 |
| 設計風格差太多（亮紙 vs 暗夜） | 只搬 lib 邏輯，畫面全部依 BB Sign 規範重寫 |
| z-running.com 的既有流量 | 決定直接停用網域，接受流量流失 |

## 10. 已定與待定

- 已定：天氣、配速整併進主站；羽球、球速、重量放「小工具」區；UI 一律用 BB Sign 的；z-running.com 直接停用（不做 301）。
- 預設：小工具放在 BB Sign 的 `/tools` 底下（同一個部署）。要拆成獨立網站也容易，因為三個工具都是純前端。
- 待定：P7 地圖跑步指數做不做。
