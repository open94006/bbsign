// 配速計算引擎。內部一律用「公里」與「秒（不先四捨五入）」，只有顯示時才轉成 h:mm:ss、m'ss"。
//
// 模型：Daniels & Gilbert《Oxygen Power》(1979)，Daniels' Running Formula 與 vdoto2.com 的 VDOT 都用這組式子
//   耗氧量       VO2(v)   = −4.60 + 0.182258·v + 0.000104·v²                       v：公尺/分
//   可維持比例   %max(t)  = 0.8 + 0.1894393·e^(−0.012778·t) + 0.2989558·e^(−0.1932605·t)   t：比賽分鐘
//   VDOT = VO2(距離/時間) ÷ %max(時間)
// VDOT 是「依比賽表現推估的跑力」，不是實測 VO₂max。

export type Mode = 'time' | 'pace'

export const MARATHON_KM = 42.195
export const RACES: [string, number][] = [
  ['5K', 5],
  ['10K', 10],
  ['半馬', MARATHON_KM / 2],
  ['全馬', MARATHON_KM],
]

// 輸入可接受的範圍：只換算配速／時間用
const DIST_MIN = 0.1
const DIST_MAX = 300
// 模型適用範圍：Daniels 的 VDOT 表涵蓋 1500 公尺到全馬、VDOT 30–85
const MODEL_MIN_KM = 1.5
const VDOT_TABLE_MIN = 30
const VDOT_MAX = 85
// ponytail: VDOT 20 以下約是 5K 40 分、全馬 6.5 小時以上，多半是走跑交替，跑步耗氧式不適用，直接不算
const VDOT_MIN = 20

// ---- 輸入解析 ----

// 空欄當 0（例如 5K 只填分秒）；非整數字串回 NaN
const int = (s: string) => (s.trim() === '' ? 0 : /^\d+$/.test(s.trim()) ? Number(s) : NaN)

export function parseInput(distance: string, mode: Mode, time: string[], pace: string[]): { distanceKm: number; totalSec: number } | { error: string } {
  if (!distance.trim()) return { error: '請輸入距離。' }
  const distanceKm = /^(\d+\.?\d*|\.\d+)$/.test(distance.trim()) ? Number(distance) : NaN
  if (Number.isNaN(distanceKm)) return { error: '距離只能填數字（公里）。' }
  if (distanceKm < DIST_MIN || distanceKm > DIST_MAX) return { error: `距離請填 ${DIST_MIN} 到 ${DIST_MAX} 公里。` }

  if (mode === 'time') {
    const [h, m, s] = time.map(int)
    if ([h, m, s].some(Number.isNaN)) return { error: '時間只能填整數。' }
    if (m > 59 || s > 59) return { error: '分、秒要在 0 到 59 之間。' }
    const totalSec = h * 3600 + m * 60 + s
    return totalSec > 0 ? { distanceKm, totalSec } : { error: '請輸入完賽時間。' }
  }
  const [m, s] = pace.map(int)
  if ([m, s].some(Number.isNaN)) return { error: '配速只能填整數。' }
  if (s > 59) return { error: '秒要在 0 到 59 之間。' }
  const secPerKm = m * 60 + s
  return secPerKm > 0 ? { distanceKm, totalSec: secPerKm * distanceKm } : { error: '請輸入每公里配速。' }
}

// ---- Daniels–Gilbert ----

const vo2At = (mPerMin: number) => -4.6 + 0.182258 * mPerMin + 0.000104 * mPerMin ** 2
// 反解 0.000104v² + 0.182258v − (4.6 + VO2) = 0 的正根
const speedAt = (vo2: number) => (-0.182258 + Math.sqrt(0.182258 ** 2 + 4 * 0.000104 * (4.6 + vo2))) / (2 * 0.000104)
const pctMax = (min: number) => 0.8 + 0.1894393 * Math.exp(-0.012778 * min) + 0.2989558 * Math.exp(-0.1932605 * min)

export const vdotOf = (distanceKm: number, totalSec: number) => {
  const min = totalSec / 60
  return vo2At((distanceKm * 1000) / min) / pctMax(min)
}

// 同一個 VDOT 跑另一個距離要幾秒：時間越長 VDOT 越低（單調），二分搜尋即可
export function raceSec(vdot: number, distanceKm: number) {
  let [fast, slow] = [distanceKm * 60, distanceKm * 1200] // 每公里 1 分到 20 分之間找
  for (let i = 0; i < 60; i++) {
    const mid = (fast + slow) / 2
    if (vdotOf(distanceKm, mid) > vdot) fast = mid
    else slow = mid
  }
  return (fast + slow) / 2
}

const paceAtPct = (vdot: number, pct: number) => 60000 / speedAt(vdot * pct)
const racePace = (vdot: number, km: number) => raceSec(vdot, km) / km

// 六種訓練配速（秒/公里，fast ≤ slow）。每一種都由同一個 VDOT 經上面的式子算出，依據：
//   E     輕鬆跑   59–74% VDOT                           Daniels 強度表
//   M     馬拉松   等效全馬比賽配速                      Daniels：M 就是以目前 VDOT 跑全馬的配速
//   Tempo 節奏跑   等效半馬 ～ 等效全馬比賽配速          Daniels：超過 20 分鐘的持續節奏跑要比 T 慢；這裡取半馬到全馬配速當 30–60 分鐘穩定跑
//                  ponytail: VDOT 60 以上半馬接近 60 分鐘，這區會和 T 幾乎重疊（生理上本來如此），UI 說明有寫
//   T     閾值跑   83–88% VDOT                           Daniels 強度表（約可撐 60 分鐘比賽的強度）
//   I     間歇     95–100% VDOT                          Daniels 強度表
//   R     重複跑   105–110% VDOT                         Daniels：R 高於 VO₂max、約一英里比賽配速（表上 VDOT 50 的 R 87 秒/400m ≈ 107%）
//                  不直接取一英里等效：慢跑者跑一英里要 10 分鐘以上，等效配速會掉進 I 區
export type Zone = 'E' | 'M' | 'Tempo' | 'T' | 'I' | 'R'
export function trainingPaces(vdot: number): Record<Zone, { fast: number; slow: number }> {
  const band = (lo: number, hi: number) => ({ fast: paceAtPct(vdot, hi), slow: paceAtPct(vdot, lo) })
  const m = racePace(vdot, MARATHON_KM)
  return {
    E: band(0.59, 0.74),
    M: { fast: m, slow: m },
    Tempo: { fast: racePace(vdot, MARATHON_KM / 2), slow: m },
    T: band(0.83, 0.88),
    I: band(0.95, 1.0),
    R: band(1.05, 1.1),
  }
}

// ---- 共用引擎：兩種輸入模式都先換成（公里, 秒）再進來 ----

export function analyze(distanceKm: number, totalSec: number) {
  const base = { distanceKm, totalSec, secPerKm: totalSec / distanceKm }
  if (distanceKm < MODEL_MIN_KM || distanceKm > MARATHON_KM + 1e-9)
    return { ...base, limit: `VDOT 模型只涵蓋 ${MODEL_MIN_KM} 公里到全馬，這個距離只換算配速與時間。` }
  const vdot = vdotOf(distanceKm, totalSec)
  if (vdot > VDOT_MAX) return { ...base, limit: `換算出的跑力超過 VDOT ${VDOT_MAX}（約世界紀錄水準），請確認距離和時間。` }
  if (vdot < VDOT_MIN) return { ...base, limit: '這個配速接近健走，跑步的耗氧模型不適用，只換算配速與時間。' }
  return {
    ...base,
    vdot,
    note: vdot < VDOT_TABLE_MIN ? `低於 Daniels 表格的 VDOT ${VDOT_TABLE_MIN}，以下是外推結果，僅供參考。` : undefined,
    equivalents: RACES.map(([name, km]) => ({ name, km, sec: raceSec(vdot, km) })),
    training: trainingPaces(vdot),
  }
}

// ---- 顯示 ----

export const formatClock = (sec: number) => {
  const s = Math.round(sec)
  const [h, m, r] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
  return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}
