import { useEffect, useRef } from 'react'
import { DISTANCES, SPORTS, STATUSES, TAGS, type Filters as F, type Sport } from './data'

type Props = { value: F; onChange: (f: F) => void; onSubmit: () => void }
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1))

type ListKey = 'month' | 'sport' | 'dist' | 'tag' | 'status'

// 設計規範 Chip：運動與報名狀態直接排出來，選項多的月份、距離與性質收進原生 <details> 下拉
export default function Filters({ value, onChange, onSubmit }: Props) {
  const root = useRef<HTMLDivElement>(null)

  // <details> 不會自己在點外面時收起
  useEffect(() => {
    const close = (e: Event) => {
      for (const d of root.current?.querySelectorAll('details[open]') ?? []) {
        if (e.type === 'keydown' ? (e as KeyboardEvent).key === 'Escape' : !d.contains(e.target as Node)) d.removeAttribute('open')
      }
    }
    addEventListener('pointerdown', close)
    addEventListener('keydown', close)
    return () => {
      removeEventListener('pointerdown', close)
      removeEventListener('keydown', close)
    }
  }, [])

  const toggle = (k: ListKey, v: string) =>
    onChange({ ...value, [k]: value[k].includes(v) ? value[k].filter((x) => x !== v) : [...value[k], v] })
  const chip = (k: ListKey, v: string, label = v, sport?: string) => (
    <button key={v} type="button" className="bb-chip" data-sport={sport} aria-pressed={value[k].includes(v)} onClick={() => toggle(k, v)}>
      {label}
    </button>
  )
  const count = (n: number) => (n ? ` ${n}` : '')
  const sports = value.sport.length ? (value.sport as Sport[]) : SPORTS

  return (
    <div className="filters" ref={root} role="group" aria-label="篩選賽事">
      {/* 打字就即時篩選；按 Enter 打開結果清單 */}
      <form
        role="search"
        className="bb-search"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <input
          type="search"
          placeholder="搜尋比賽名稱"
          aria-label="搜尋比賽名稱"
          enterKeyHint="search"
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
        />
      </form>
      <div className="bb-chips" role="group" aria-label="運動">
        {SPORTS.map((s) => chip('sport', s, s, s))}
      </div>
      <div className="bb-chips" role="group" aria-label="報名狀態">
        {STATUSES.map((s) => chip('status', s))}
      </div>
      <div className="bb-chips">
        <details className="bb-menu">
          <summary className="bb-chip">月份{count(value.month.length)}</summary>
          <div className="bb-menu__panel">
            <div className="bb-chips">{MONTHS.map((m) => chip('month', m, `${m}月`))}</div>
          </div>
        </details>
        <details className="bb-menu">
          <summary className="bb-chip">距離{count(value.dist.length)}</summary>
          <div className="bb-menu__panel">
            {sports.map((s) => (
              <div key={s} className="menu-group">
                <span className="t-caption">{s}</span>
                <div className="bb-chips">{DISTANCES[s].map(([label]) => chip('dist', `${s}:${label}`, label))}</div>
              </div>
            ))}
          </div>
        </details>
        <details className="bb-menu">
          <summary className="bb-chip">性質{count(value.tag.length)}</summary>
          <div className="bb-menu__panel">
            <div className="bb-chips">{TAGS.map((t) => chip('tag', t))}</div>
          </div>
        </details>
      </div>
    </div>
  )
}
