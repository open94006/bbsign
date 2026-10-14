import { useEffect, useState } from 'react'
import type { RaceEvent } from '../data'
import { getHeatStressLevel } from '../lib/runningCondition'

// 對應 backend/weather.py 的 /api/weather/week；CWA 第 4 天起沒有降雨機率（null）
type Period = {
  start: string
  description: string | null
  maxTemp: number | null
  minTemp: number | null
  maxFeelsLike: number | null
  dewPoint: number | null
  precipitationProbability: number | null
  uvIndex: number | null
}

const FORECAST_DAYS = 6
const HEAT = { none: '', slight: '稍悶熱', moderate: '悶熱，記得補水、配速放慢', severe: '非常悶熱，補水優先，量力而為' } as const

// 賽事詳細卡的「比賽天氣」一列：一週內才抓縣市預報，取比賽日白天那一段；沒有預報（太遠、載入中、抓不到）就不顯示
export default function RaceWeather({ e, today }: { e: RaceEvent; today: string }) {
  const days = (Date.parse(e.race_date) - Date.parse(today)) / 86400000
  const soon = days >= 0 && days <= FORECAST_DAYS
  const [p, setP] = useState<Period | null | undefined>(undefined) // undefined 載入中、null 抓不到
  const [town, setTown] = useState('')

  useEffect(() => {
    if (!soon) return
    const ctrl = new AbortController()
    // 後端從地點文字比對鄉鎮（苓雅運動園區 → 苓雅區），比對不到就用縣市政府所在的鄉鎮
    const qs = new URLSearchParams({ county: e.county, ...(e.venue && { venue: e.venue.slice(0, 200) }) })
    fetch(`/api/weather/week?${qs}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { town: string; periods: Period[] }) => {
        setTown(d.town)
        const sameDay = d.periods.filter((x) => x.start.startsWith(e.race_date))
        // 白天時段（06–18 點開始）優先；比賽當天下午才看就只剩傍晚那段
        setP(sameDay.find((x) => Number(x.start.slice(11, 13)) < 18) ?? sameDay[0] ?? null)
      })
      .catch(() => !ctrl.signal.aborted && setP(null))
    return () => ctrl.abort()
  }, [soon, e.county, e.venue, e.race_date])

  if (!soon || !p) return null
  const temp = p.minTemp != null && p.maxTemp != null ? `${p.minTemp}–${p.maxTemp}°C` : ''
  const rain = p.precipitationProbability == null ? '降雨機率尚未公布' : `降雨 ${p.precipitationProbability}%`
  const heat = p.maxTemp != null && p.dewPoint != null ? HEAT[getHeatStressLevel(p.maxTemp, p.dewPoint)] : ''
  const text = [p.description, temp, rain, p.uvIndex != null && `紫外線 ${p.uvIndex}`, heat].filter(Boolean).join('・')

  return (
    <div>
      <dt className="t-label">比賽天氣</dt>
      <dd>
        {text}
        <br />
        <span className="bb-source t-caption">
          {e.county}
          {town}預報
        </span>
      </dd>
    </div>
  )
}
