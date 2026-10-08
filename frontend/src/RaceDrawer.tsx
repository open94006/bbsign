import { useEffect, useRef } from 'react'
import RaceRow from './RaceRow'
import type { RaceEvent } from './data'

type Props = {
  open: boolean
  title: string
  summary: string
  events: RaceEvent[]
  today: string
  openId: number | null
  onToggle: (id: number) => void
  onClose: () => void
  onClear: () => void
}

// 設計規範 RaceDrawer：右側滑出的賽事選單，首頁唯一會捲動的區域
export default function RaceDrawer({ open, title, summary, events, today, openId, onToggle, onClose, onClear }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open, onClose])

  // 換縣市時回到清單頂端；指定展開的賽事時捲到那一列
  useEffect(() => {
    const target = openId === null ? null : document.getElementById(`race-${openId}`)
    if (target) target.scrollIntoView({ block: 'nearest' })
    else listRef.current?.scrollTo({ top: 0 })
  }, [title, openId])

  return (
    <aside className="bb-drawer" data-open={open} inert={!open} aria-labelledby="drawer-title">
      <div className="bb-drawer__head">
        <div>
          <h2 id="drawer-title" className="t-title-l">
            {title}
          </h2>
          <p className="t-label">{summary}</p>
        </div>
        <button ref={closeRef} type="button" className="bb-icon-btn bb-icon-btn--close" aria-label="關閉賽事選單" onClick={onClose}>
          ×
        </button>
      </div>
      {events.length === 0 ? (
        <div className="bb-drawer__empty t-body">
          <p>{title}在這些條件下沒有賽事。放寬季節、距離或性質，或改看全台。</p>
          <button type="button" className="bb-btn" onClick={onClear}>
            清除篩選
          </button>
        </div>
      ) : (
        <ul ref={listRef} className="bb-drawer__list">
          {events.map((e) => (
            <RaceRow key={e.id} e={e} today={today} open={openId === e.id} onToggle={() => onToggle(e.id)} />
          ))}
        </ul>
      )}
    </aside>
  )
}
