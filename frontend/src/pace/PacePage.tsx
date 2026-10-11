import { useEffect, useState } from 'react'
import { formatPace, getTrainingPaces } from '../lib/runningCondition'
import Page from '../Page'
import './pace.css'

const PRESETS: [string, number][] = [
  ['5K', 5],
  ['10K', 10],
  ['半馬', 21.0975],
  ['全馬', 42.195],
]
const TRAINING = [
  ['easy', '輕鬆跑 E', '有氧基礎、恢復跑、長距離，可以邊跑邊聊天的強度。'],
  ['tempo', '節奏跑 T', '乳酸閾值，「舒服的辛苦」，一次 20 分鐘左右或分段跑。'],
  ['interval', '間歇 I', '提升最大攝氧量，每趟 3–5 分鐘、休息時間與跑的時間差不多。'],
] as const

// 時間欄位：h:mm:ss ↔ 秒數
const clock = (sec: number) => {
  const s = Math.round(sec)
  const [h, m, r] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
  return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}
const parseClock = (t: string | null) => {
  const parts = (t ?? '').split(':').map(Number)
  if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}
const n = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0)
const trim = (x: number) => String(Number(x.toFixed(4)))

// 網址帶 ?d=21.0975&t=2:00:00 可以分享，也讓賽事頁直接帶入距離
function initial() {
  const p = new URLSearchParams(location.search)
  const d = parseFloat(p.get('d') ?? '')
  const t = parseClock(p.get('t'))
  const dist = d > 0 && d <= 300 ? d : 10
  // 只帶距離時，先用每公里 6 分當起點
  const sec = t && t > 0 ? t : Math.round(dist * 360)
  return { dist, sec }
}

export default function PacePage() {
  const [init] = useState(initial)
  const [distance, setDistance] = useState(trim(init.dist))
  const [mode, setMode] = useState<'time' | 'pace'>('time')
  const [time, setTime] = useState(() => clock(init.sec).split(':'))
  const [pace, setPace] = useState(() => formatPace(init.sec / init.dist).replace('"', '').split("'"))

  const dist = n(distance)
  const sec = mode === 'time' ? n(time[0]) * 3600 + n(time[1]) * 60 + n(time[2]) : (n(pace[0]) * 60 + n(pace[1])) * dist
  const secPerKm = dist > 0 ? sec / dist : 0
  // ponytail: Daniels 公式在每公里 2:30–15:00 之外不可信，超出範圍就不顯示 VDOT 與訓練配速
  const valid = dist > 0 && secPerKm >= 150 && secPerKm <= 900
  const training = valid ? getTrainingPaces(dist, secPerKm) : null

  useEffect(() => {
    if (valid) history.replaceState(null, '', `?d=${trim(dist)}&t=${clock(sec)}`)
  }, [valid, dist, sec])

  // 換模式時把目前的結果帶到另一邊，數字不會跳掉
  const switchMode = (m: 'time' | 'pace') => {
    if (m === mode) return
    if (valid) {
      setTime(clock(sec).split(':'))
      setPace(formatPace(secPerKm).replace('"', '').split("'"))
    }
    setMode(m)
  }

  return (
    <Page title="配速計算" description="輸入比賽距離與目標完賽時間，算出每公里配速、VDOT 跑力與訓練配速，5K、10K、半馬、全馬都適用。">
      <div className="pace-form">
        <fieldset className="pace-field">
          <legend className="t-label">距離</legend>
          <div className="pace-row">
            {PRESETS.map(([label, km]) => (
              <button key={label} type="button" className="bb-chip" aria-pressed={Math.abs(dist - km) < 0.01} onClick={() => setDistance(trim(km))}>
                {label}
              </button>
            ))}
            <label className="pace-input">
              <input inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} aria-label="距離（公里）" />
              <span className="t-label">公里</span>
            </label>
          </div>
        </fieldset>

        <fieldset className="pace-field">
          <legend className="t-label">目標</legend>
          <div className="pace-row" role="group" aria-label="用完賽時間或配速輸入">
            <button type="button" className="bb-chip" aria-pressed={mode === 'time'} onClick={() => switchMode('time')}>
              完賽時間
            </button>
            <button type="button" className="bb-chip" aria-pressed={mode === 'pace'} onClick={() => switchMode('pace')}>
              每公里配速
            </button>
          </div>
          <div className="pace-row">
            {mode === 'time'
              ? ['時', '分', '秒'].map((unit, i) => (
                  <label key={unit} className="pace-input pace-input--s">
                    <input inputMode="numeric" value={time[i]} onChange={(e) => setTime(time.map((v, j) => (j === i ? e.target.value : v)))} aria-label={unit} />
                    <span className="t-label">{unit}</span>
                  </label>
                ))
              : ['分', '秒'].map((unit, i) => (
                  <label key={unit} className="pace-input pace-input--s">
                    <input inputMode="numeric" value={pace[i]} onChange={(e) => setPace(pace.map((v, j) => (j === i ? e.target.value : v)))} aria-label={`配速${unit}`} />
                    <span className="t-label">{unit} / km</span>
                  </label>
                ))}
          </div>
        </fieldset>
      </div>

      {valid && training ? (
        <>
          <dl className="pace-result" aria-live="polite">
            <div>
              <dt className="t-label">每公里配速</dt>
              <dd className="pace-big">{formatPace(secPerKm)}</dd>
            </div>
            <div>
              <dt className="t-label">完賽時間</dt>
              <dd className="pace-big">{clock(sec)}</dd>
            </div>
            <div>
              <dt className="t-label">VDOT 跑力</dt>
              <dd className="pace-big">{training.vdot}</dd>
            </div>
          </dl>

          <section className="pace-training" aria-labelledby="pace-training">
            <h2 id="pace-training" className="t-title">
              訓練配速
            </h2>
            <ul>
              {TRAINING.map(([key, name, desc]) => (
                <li key={key}>
                  <span className="t-title">{name}</span>
                  <span className="pace-range">
                    {formatPace(training[key].minSecPerKm)}–{formatPace(training[key].maxSecPerKm)}
                    <small> /km</small>
                  </span>
                  <span className="t-body pace-muted">{desc}</span>
                </li>
              ))}
            </ul>
            <p className="t-caption pace-muted">依 Jack Daniels《跑步方程式》的 VDOT 換算。天氣熱或爬坡時配速放慢是正常的，看體感調整。</p>
          </section>
        </>
      ) : (
        <p className="t-body pace-muted" role="status">
          輸入距離與時間，配速要在每公里 2:30 到 15:00 之間才會換算。
        </p>
      )}
    </Page>
  )
}
