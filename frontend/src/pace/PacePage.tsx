import { useEffect, useState } from 'react'
import { formatPace } from '../lib/runningCondition'
import { onlyDecimal, onlyDigits } from '../lib/utils'
import { analyze, formatClock, parseInput, RACES, type Mode, type Zone } from '../lib/vdot'
import Page from '../Page'
import './pace.css'

// 依強度由慢到快；依據寫在 lib/vdot.ts 的 trainingPaces
const TRAINING: [Zone, string, string][] = [
  ['E', '輕鬆跑 E', '可以邊跑邊聊天的強度，用在恢復跑、長距離和大部分的日常跑量。'],
  ['M', '馬拉松配速 M', '依目前跑力推算的全馬比賽配速，練比賽節奏與補給。'],
  ['Tempo', '節奏跑 Tempo', '持續 30–60 分鐘的穩定跑，介於半馬和全馬比賽配速之間，比閾值跑稍慢。跑力越高會越接近閾值配速。'],
  ['T', '閾值跑 T', '「舒服的辛苦」，約能撐一小時比賽的強度。一次 20 分鐘，或分段跑（例如 1 公里 × 5，每趟休 1 分鐘）。'],
  ['I', '間歇 I', '提升最大攝氧量，每趟 3–5 分鐘，休息時間和跑的時間差不多。'],
  ['R', '重複跑 R', '約一英里比賽的速度，每趟 200–400 公尺、不超過 2 分鐘，休息到完全恢復，練速度與跑姿。'],
]

const n = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0)
const trim = (x: number) => String(Number(x.toFixed(4)))
const paceParts = (secPerKm: number) => formatPace(secPerKm).replace('"', '').split("'")
const parseClock = (t: string | null) => {
  const parts = (t ?? '').split(':').map(Number)
  if (parts.length < 2 || parts.length > 3 || parts.some((x) => !Number.isFinite(x) || x < 0)) return null
  return parts.reduce((acc, x) => acc * 60 + x, 0)
}

// 網址帶 ?d=21.0975&t=2:00:00（完賽時間）或 ?d=21.0975&p=5:41（配速）可以分享，賽事頁也直接帶入距離
function initial() {
  const q = new URLSearchParams(location.search)
  const d = parseFloat(q.get('d') ?? '')
  const dist = d > 0 && d <= 300 ? d : 10
  const p = parseClock(q.get('p'))
  const t = parseClock(q.get('t'))
  // 只帶距離時，先用每公里 6 分當起點
  const secPerKm = p && p > 0 ? p : t && t > 0 ? t / dist : 360
  return { dist, mode: (p ? 'pace' : 'time') as Mode, sec: t && t > 0 ? t : secPerKm * dist, secPerKm }
}

const Tag = ({ input }: { input: boolean }) => <span className={input ? 'pace-tag pace-tag--in' : 'pace-tag'}>{input ? '你輸入' : '計算'}</span>

export default function PacePage() {
  const [init] = useState(initial)
  const [distance, setDistance] = useState(trim(init.dist))
  const [mode, setMode] = useState<Mode>(init.mode)
  const [time, setTime] = useState(() => formatClock(init.sec).split(':'))
  const [pace, setPace] = useState(() => paceParts(init.secPerKm))

  const parsed = parseInput(distance, mode, time, pace)
  const r = 'error' in parsed ? null : analyze(parsed.distanceKm, parsed.totalSec)
  const preset = RACES.find(([, km]) => Math.abs(n(distance) - km) < 0.001)?.[0]
  const isTarget = mode === 'pace'

  const query = r && `?d=${trim(r.distanceKm)}&${isTarget ? `p=${paceParts(r.secPerKm).join(':')}` : `t=${formatClock(r.totalSec)}`}`
  useEffect(() => {
    if (query) history.replaceState(null, '', query)
  }, [query])

  // 換模式時把目前的結果帶到另一邊，數字不會跳掉
  const switchMode = (m: Mode) => {
    if (m === mode) return
    if (r) {
      setTime(formatClock(r.totalSec).split(':'))
      setPace(paceParts(r.secPerKm))
    }
    setMode(m)
  }

  return (
    <Page title="配速計算" description="選比賽距離，填完賽時間或每公里配速其中一項，算出平均配速、VDOT 跑力、5K 到全馬的等效成績與訓練配速。">
      <div className="pace-form">
        <fieldset className="pace-field">
          <legend className="t-label">1. 比賽距離</legend>
          <div className="pace-row">
            {RACES.map(([label, km]) => (
              <button key={label} type="button" className="bb-chip" aria-pressed={preset === label} onClick={() => setDistance(trim(km))}>
                {label}
              </button>
            ))}
            <label className="pace-input">
              <span className="t-label">自訂</span>
              <input inputMode="decimal" value={distance} onChange={(e) => setDistance(onlyDecimal(e.target.value))} aria-label="自訂距離（公里）" />
              <span className="t-label">公里</span>
            </label>
          </div>
        </fieldset>

        <fieldset className="pace-field">
          <legend className="t-label">2. 擇一填寫</legend>
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
                    <input inputMode="numeric" maxLength={2} value={time[i]} onChange={(e) => setTime(time.map((v, j) => (j === i ? onlyDigits(e.target.value) : v)))} aria-label={unit} />
                    <span className="t-label">{unit}</span>
                  </label>
                ))
              : ['分', '秒'].map((unit, i) => (
                  <label key={unit} className="pace-input pace-input--s">
                    <input inputMode="numeric" maxLength={2} value={pace[i]} onChange={(e) => setPace(pace.map((v, j) => (j === i ? onlyDigits(e.target.value) : v)))} aria-label={`配速${unit}`} />
                    <span className="t-label">{unit} / km</span>
                  </label>
                ))}
          </div>
          <p className="t-caption pace-muted">{isTarget ? '用目標配速推算：結果是「如果能用這個配速跑完」的情境，不代表已經具備這個實力。' : '用最近一場比賽的實際成績最準。'}</p>
        </fieldset>
      </div>

      {!r ? (
        <p className="t-body pace-msg" role="alert">
          {'error' in parsed && parsed.error}
        </p>
      ) : (
        <>
          <section className="pace-section" aria-labelledby="pace-basic" aria-live="polite">
            <h2 id="pace-basic" className="t-title">
              基本結果
              <span className="t-label pace-muted">
                {preset ? `${preset}・` : ''}
                {trim(r.distanceKm)} 公里・依{isTarget ? '每公里配速' : '完賽時間'}
              </span>
            </h2>
            <dl className="pace-result">
              <div>
                <dt className="t-label">
                  完賽時間 <Tag input={!isTarget} />
                </dt>
                <dd className="pace-big">{formatClock(r.totalSec)}</dd>
              </div>
              <div>
                <dt className="t-label">
                  每公里配速 <Tag input={isTarget} />
                </dt>
                <dd className="pace-big">{formatPace(r.secPerKm)}</dd>
              </div>
              <div>
                <dt className="t-label">
                  VDOT 跑力 <span className="pace-tag">{isTarget ? '依此配速推估' : '估算'}</span>
                </dt>
                <dd className="pace-big">{'vdot' in r ? r.vdot.toFixed(1) : '—'}</dd>
              </div>
            </dl>
            {'limit' in r ? (
              <p className="t-body pace-msg" role="status">
                {r.limit}
              </p>
            ) : (
              <p className="t-caption pace-muted">
                VDOT 是依比賽表現推估的跑力指標，不是實測的最大攝氧量。{r.note}
              </p>
            )}
          </section>

          {'training' in r && (
            <>
              <section className="pace-section" aria-labelledby="pace-equiv">
                <h2 id="pace-equiv" className="t-title">
                  等效成績 <span className="pace-tag">{isTarget ? '依此配速推估' : '模型估算'}</span>
                </h2>
                <ul className="pace-equiv">
                  {r.equivalents.map(({ name, km, sec }) => (
                    <li key={name}>
                      <span className="t-label">
                        {name} {preset === name && <span className="pace-tag pace-tag--in">{isTarget ? '你的目標' : '你的成績'}</span>}
                      </span>
                      <span className="pace-range">{formatClock(sec).replace(/^0:/, '')}</span>
                      <span className="t-caption pace-muted">{formatPace(sec / km)} /km</span>
                    </li>
                  ))}
                </ul>
                <p className="t-caption pace-muted">
                  {isTarget ? '這是假設你能用這個配速跑完、再換算到其他距離的推估，不是已驗證的成績。' : '這是同一個跑力換算到其他距離的估計，不是實際成績。'}
                  距離差越多越不準：這類模型以菁英跑者校準，一般跑者從短距離推長距離通常會估得偏快，全馬尤其明顯。
                </p>
              </section>

              <section className="pace-training" aria-labelledby="pace-training">
                <h2 id="pace-training" className="t-title">
                  訓練配速
                </h2>
                <ul>
                  {TRAINING.map(([key, name, desc]) => {
                    const { fast, slow } = r.training[key]
                    return (
                      <li key={key}>
                        <span className="t-title">{name}</span>
                        <span className="pace-range">
                          {formatPace(fast) === formatPace(slow) ? formatPace(fast) : `${formatPace(fast)}–${formatPace(slow)}`}
                          <small> /km</small>
                        </span>
                        <span className="t-body pace-muted">{desc}</span>
                      </li>
                    )
                  })}
                </ul>
                <p className="t-caption pace-muted">
                  依 Jack Daniels《跑步方程式》的 VDOT 模型（Daniels &amp; Gilbert 公式）換算。{isTarget && '配速是用目標配速推得的，還沒跑出這個成績前，建議改用最近一場比賽的成績來算。'}
                  天氣熱或爬坡時放慢是正常的，看體感調整。
                </p>
              </section>
            </>
          )}
        </>
      )}
    </Page>
  )
}
