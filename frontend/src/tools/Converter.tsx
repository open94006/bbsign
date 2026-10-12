import { useState } from 'react'
import { onlyDecimal } from '../lib/utils'
import Page from '../Page'
import './tools.css'

type Props = {
  title: string
  units: [string, string]
  factor: number // 第二個單位 = 第一個單位 × factor
  digits: number
  presets: [number, 0 | 1][]
}

// 兩個欄位互相換算：改哪一邊就算另一邊
function Pair({ title, units, factor, digits, presets }: Props) {
  const [v, setV] = useState<[string, string]>(['', ''])
  const set = (i: 0 | 1, raw: string) => {
    const s = onlyDecimal(raw)
    const x = parseFloat(s)
    const other = Number.isFinite(x) ? String(Number((i === 0 ? x * factor : x / factor).toFixed(digits))) : ''
    setV(i === 0 ? [s, other] : [other, s])
  }
  return (
    <section className="cv" aria-label={title}>
      <h2 className="t-title">{title}</h2>
      <div className="cv-fields">
        {units.map((unit, i) => (
          <label key={unit} className="cv-field">
            <input inputMode="decimal" value={v[i]} placeholder="0" onChange={(e) => set(i as 0 | 1, e.target.value)} />
            <span className="t-label">{unit}</span>
          </label>
        ))}
      </div>
      <div className="tl-row">
        {presets.map(([n, i]) => (
          <button key={`${n}${i}`} type="button" className="bb-chip" onClick={() => set(i, String(n))}>
            {n} {units[i]}
          </button>
        ))}
      </div>
    </section>
  )
}

export default function Converter() {
  return (
    <Page title="重量、球速換算" description="重量 kg 與 lb、球速 mph 與 km/h 即時互換。">
      <div className="cv-list">
        <Pair title="重量" units={['kg', 'lb']} factor={1 / 0.45359237} digits={2} presets={[[20, 0], [25, 0], [10, 1], [25, 1], [45, 1]]} />
        <Pair title="球速" units={['km/h', 'mph']} factor={1 / 1.609344} digits={1} presets={[[145, 0], [150, 0], [90, 1], [95, 1]]} />
      </div>
      <p className="t-caption tl-muted">1 磅 = 0.45359237 公斤、1 英里 = 1.609344 公里（國際定義值）。</p>
    </Page>
  )
}
