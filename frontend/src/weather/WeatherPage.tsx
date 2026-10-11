import { useEffect, useState } from 'react'
import { COUNTIES } from '../data'
import { getClothingAdvice, getCompassDirection, getHydrationAdvice } from '../lib/runnerAdvice'
import { getHeatStressLevel, getRunningCondition, pickBestSlotIndex, type RunnerTolerance } from '../lib/runningCondition'
import { getSunTimes } from '../lib/sunTimes'
import Page from '../Page'
import './weather.css'

type Slot = {
  time: string
  temperature: number | null
  feelsLike: number | null
  humidity: number | null
  windSpeed: number | null
  precipitationProbability: number | null
  description: string | null
}

// 對應 backend/weather.py 的 /api/weather；上游缺值時欄位是 null
type Weather = {
  location: string
  city: string
  town: string
  towns: string[]
  station: string
  lat: number
  lon: number
  temperature: number
  humidity: number
  windSpeed: number
  windDeg: number | null
  description: string | null
  feelsLike: number | null
  precipitationProbability: number | null
  uvIndex: number | null
  uvLevel: string | null
  temperatureTrend6h: Slot[]
  airQuality: { aqi: number; aqiValue: number; description: string; station: string; components: { pm2_5: number | null; pm10: number | null; o3: number | null } } | null
  timestamp: string
  source: string
}

type Query = { county: string; town?: string } | { lat: number; lon: number }

const TOLERANCE: [RunnerTolerance, string][] = [
  ['heat', '怕熱'],
  ['normal', '普通'],
  ['cold', '怕冷'],
]
const PENALTY_LABEL = { temperature: '氣溫', airQuality: '空氣', humidity: '濕度', dewPoint: '露點', wind: '風速' } as const

// localStorage 只存個人偏好；私密視窗等情況會丟錯，讀不到就用預設值
const load = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const save = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 存不了就算了 */
  }
}

const clock = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' })
const time = (d: string | Date) => clock.format(new Date(d))
const num = (v: number | null | undefined, unit = '') => (v == null ? '—' : `${Math.round(v * 10) / 10}${unit}`)
// 座標只留小數兩位（約 1 公里）：挑最近測站夠用，伺服器記錄也不會留下精確位置
const round2 = (x: number) => Math.round(x * 100) / 100

export default function WeatherPage() {
  const [query, setQuery] = useState<Query>(() => {
    const saved = load('bb:wx:county')
    // 鄉鎮由後端驗證，不在白名單會改用縣市政府所在地
    return saved && COUNTIES.includes(saved) ? { county: saved, town: load('bb:wx:town') ?? undefined } : { county: '臺北市' }
  })
  const [data, setData] = useState<Weather | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [locating, setLocating] = useState(false)
  const [tolerance, setTolerance] = useState<RunnerTolerance>(() => TOLERANCE.find(([t]) => t === load('bb:wx:tolerance'))?.[0] ?? 'normal')
  const [minutes, setMinutes] = useState(60)

  // 換地點時先標成載入中（在事件裡設，不在 effect 裡設），effect 只負責抓資料
  const choose = (q: Query) => {
    setLoading(true)
    setError(null)
    setQuery(q)
  }

  useEffect(() => {
    const ctrl = new AbortController()
    const qs = 'county' in query ? new URLSearchParams({ county: query.county, ...(query.town && { town: query.town }) }) : `lat=${query.lat}&lon=${query.lon}`
    fetch(`/api/weather?${qs}`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        // 400、503 的 detail 是後端寫的中文訊息；其他狀態碼（404、422…）一律用通用訊息
        if (!r.ok) throw new Error([400, 503].includes(r.status) && typeof body?.detail === 'string' ? body.detail : '天氣資料暫時無法取得，請稍後再試')
        return body as Weather
      })
      .then((d) => {
        setData(d)
        save('bb:wx:county', d.city)
        save('bb:wx:town', d.town)
      })
      .catch((e: Error) => !ctrl.signal.aborted && setError(e.message))
      .finally(() => !ctrl.signal.aborted && setLoading(false))
    return () => ctrl.abort()
  }, [query])

  const locate = () => {
    if (!navigator.geolocation) return setError('這個瀏覽器不支援定位，請改選縣市。')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false)
        choose({ lat: round2(p.coords.latitude), lon: round2(p.coords.longitude) })
      },
      () => {
        setLocating(false)
        setError('沒有取得定位。請允許這個網站使用位置，或直接選縣市。')
      },
      { timeout: 10000, maximumAge: 600000 },
    )
  }

  const pickTolerance = (t: RunnerTolerance) => {
    setTolerance(t)
    save('bb:wx:tolerance', t)
  }

  return (
    <Page title="跑步天氣" description="現在適不適合跑步？依所在位置或縣市，看氣溫、濕度、空氣品質、紫外線與未來 6 小時的跑步建議。資料來自中央氣象署與環境部。">
      <div className="wx-controls">
        <label className="sr-only" htmlFor="wx-county">
          縣市
        </label>
        <select
          id="wx-county"
          className="wx-select"
          value={data?.city ?? ('county' in query ? query.county : '')}
          onChange={(e) => choose({ county: e.target.value })}
        >
          {COUNTIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {data && (
          <>
            <label className="sr-only" htmlFor="wx-town">
              鄉鎮市區
            </label>
            <select id="wx-town" className="wx-select" value={data.town} onChange={(e) => choose({ county: data.city, town: e.target.value })}>
              {data.towns.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </>
        )}
        <button type="button" className="bb-btn" onClick={locate} aria-busy={locating} disabled={locating}>
          {locating ? '定位中…' : '用我的位置'}
        </button>
        <div className="wx-tolerance" role="group" aria-label="你比較怕熱還是怕冷">
          <span className="t-label">我比較</span>
          {TOLERANCE.map(([t, label]) => (
            <button key={t} type="button" className="bb-chip" aria-pressed={tolerance === t} onClick={() => pickTolerance(t)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="wx-notice t-body" role="alert">
          {error}
        </p>
      )}
      {!data && loading && (
        <p className="t-body wx-muted" aria-live="polite">
          正在取得天氣…
        </p>
      )}
      {data && <Report d={data} tolerance={tolerance} minutes={minutes} setMinutes={setMinutes} busy={loading} />}
    </Page>
  )
}

type ReportProps = { d: Weather; tolerance: RunnerTolerance; minutes: number; setMinutes: (m: number) => void; busy: boolean }

function Report({ d, tolerance, minutes, setMinutes, busy }: ReportProps) {
  const aqi = d.airQuality?.aqi
  const pm25 = d.airQuality?.components.pm2_5 ?? undefined
  const cond = getRunningCondition(d.temperature, aqi, pm25, d.humidity, d.windSpeed, tolerance)
  const goods = (Object.keys(PENALTY_LABEL) as (keyof typeof PENALTY_LABEL)[]).filter((k) => cond.penalties[k] === 0)

  const slots = d.temperatureTrend6h
    .filter((s) => s.temperature != null)
    .map((s) => ({ ...s, cond: getRunningCondition(s.temperature!, aqi, pm25, s.humidity ?? d.humidity, s.windSpeed ?? d.windSpeed, tolerance) }))
  const best = pickBestSlotIndex(slots.map((s) => s.cond.score))

  const heat = getHeatStressLevel(d.temperature, cond.dewPoint)
  const observed = new Date(d.timestamp) // 以觀測時間當「現在」，畫面不會因重新 render 而跳動
  const sun = getSunTimes(d.lat, d.lon, observed)
  const clothing = getClothingAdvice(d.feelsLike ?? d.temperature)
  const hydration = getHydrationAdvice(d.temperature, cond.dewPoint, minutes)
  const windDir = d.windDeg == null ? null : getCompassDirection(d.windDeg)

  return (
    <div className="wx-report" aria-busy={busy}>
      <section className="wx-hero" data-level={cond.level} aria-label="現在適不適合跑步">
        <p className="t-label wx-muted">
          {d.location}・{d.station}測站・{time(d.timestamp)} 觀測
        </p>
        <p className="wx-verdict">
          <span className="wx-verdict__text">{cond.text}</span>
          <span className="wx-verdict__score">
            {cond.score}
            <small>/100</small>
          </span>
        </p>
        <div className="wx-bar" role="img" aria-label={`跑步分數 ${cond.score} 分，滿分 100 分`}>
          <span style={{ width: `${cond.score}%` }} />
        </div>
        <ul className="wx-tags t-label">
          {cond.issues.map((i) => (
            <li key={i} className="wx-tag wx-tag--warn">
              {i}
            </li>
          ))}
          {goods.map((k) => (
            <li key={k} className="wx-tag">
              {PENALTY_LABEL[k]}佳
            </li>
          ))}
        </ul>
      </section>

      <dl className="wx-stats">
        <div>
          <dt className="t-label">氣溫</dt>
          <dd className="wx-figure">{num(d.temperature, '°')}</dd>
          <dd className="t-caption wx-muted">
            體感 {num(d.feelsLike, '°')}・露點 {num(cond.dewPoint, '°')}
          </dd>
        </div>
        <div>
          <dt className="t-label">濕度</dt>
          <dd className="wx-figure">{num(Math.round(d.humidity), '%')}</dd>
          <dd className="t-caption wx-muted">{d.humidity > 70 ? '偏高，散熱變差' : '舒適'}</dd>
        </div>
        <div>
          <dt className="t-label">風</dt>
          <dd className="wx-figure">
            {d.windSpeed}
            <small> km/h</small>
          </dd>
          <dd className="t-caption wx-muted">{windDir ? `${windDir}風` : '風向未知'}</dd>
        </div>
        <div>
          <dt className="t-label">降雨機率</dt>
          <dd className="wx-figure">{num(d.precipitationProbability, '%')}</dd>
          <dd className="t-caption wx-muted">
            {d.precipitationProbability == null ? '預報未公布' : d.precipitationProbability >= 60 ? '建議帶雨具' : d.precipitationProbability >= 30 ? '可能有雨' : '不太會下雨'}
          </dd>
        </div>
        <div>
          <dt className="t-label">紫外線</dt>
          <dd className="wx-figure">{num(d.uvIndex)}</dd>
          <dd className="t-caption wx-muted">{d.uvLevel ?? '夜間無預報'}</dd>
        </div>
        <div>
          <dt className="t-label">空氣品質 AQI</dt>
          <dd className="wx-figure">{num(d.airQuality?.aqiValue)}</dd>
          <dd className="t-caption wx-muted">
            {d.airQuality ? `${d.airQuality.description}・PM2.5 ${num(d.airQuality.components.pm2_5)}・${d.airQuality.station}站` : '暫無資料'}
          </dd>
        </div>
      </dl>

      {slots.length > 0 && (
        <section className="wx-section" aria-labelledby="wx-trend">
          <h2 id="wx-trend" className="t-title">
            未來 6 小時
          </h2>
          <ol className="wx-trend">
            {slots.map((s, i) => (
              <li key={s.time} data-level={s.cond.level} data-best={i === best || undefined}>
                <span className="t-label wx-muted">{time(s.time)}</span>
                <span className="wx-trend__temp">{num(s.temperature, '°')}</span>
                <span className="t-caption">{s.description ?? '—'}</span>
                <span className="wx-bar wx-bar--s" aria-hidden="true">
                  <span style={{ width: `${s.cond.score}%` }} />
                </span>
                <span className="t-caption">
                  {s.cond.text} {s.cond.score}・降雨 {num(s.precipitationProbability, '%')}
                </span>
                {i === best && <span className="wx-best t-caption">最適合</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="wx-advice">
        <section className="wx-section">
          <h2 className="t-title">穿著：{clothing.title}</h2>
          <p className="t-body wx-muted">{clothing.description}</p>
        </section>
        <section className="wx-section">
          <h2 className="t-title">補水</h2>
          <p className="t-body wx-muted">{hydration.message}</p>
          <div className="wx-chips" role="group" aria-label="預計跑多久">
            {[30, 60, 90].map((m) => (
              <button key={m} type="button" className="bb-chip" aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
                {m} 分鐘
              </button>
            ))}
          </div>
        </section>
        {sun.sunrise && sun.sunset && (
          <section className="wx-section">
            <h2 className="t-title">日出日落</h2>
            <p className="t-body wx-muted">
              日出 {time(sun.sunrise)}・日落 {time(sun.sunset)}
              {heat !== 'none' && observed < sun.sunset && '。現在偏悶熱，日落後再跑會涼快一些。'}
            </p>
          </section>
        )}
        <section className="wx-section">
          <h2 className="t-title">風向</h2>
          <p className="t-body wx-muted">
            {windDir ? `目前吹${windDir}風。` : ''}
            風速超過 20 km/h 時逆風阻力明顯，配速會掉；建議去程頂風、回程順風。
          </p>
        </section>
      </div>

      <p className="t-caption wx-muted">
        資料來源：{d.source}。預報為{d.town}的鄉鎮預報，即時觀測來自最近的{d.station}測站。
      </p>
    </div>
  )
}
