import { useSyncExternalStore } from 'react'
import { COUNTDOWN_LIST_DAYS, countdownTarget, splitTime, type RaceEvent } from './data'

// 所有計時器共用一個每秒的時鐘：沒有計時器在畫面上就停掉
let timer = 0
const listeners = new Set<() => void>()
function subscribe(fn: () => void) {
  listeners.add(fn)
  if (!timer) timer = window.setInterval(() => listeners.forEach((l) => l()), 1000)
  return () => {
    listeners.delete(fn)
    if (!listeners.size) {
      clearInterval(timer)
      timer = 0
    }
  }
}
const nowSecond = () => Math.floor(Date.now() / 1000) * 1000
const useNow = () => useSyncExternalStore(subscribe, nowSecond)

const pad = (n: number) => String(n).padStart(2, '0')
// 報名截止前 3 天轉成警示色，跟「剩 N 天」的規則一致
const URGENT = 3 * 86_400_000

// 設計規範 Countdown（展開版）：四格大數字，天／時／分／秒
export function CountdownPanel({ e, today }: { e: RaceEvent; today: string }) {
  const now = useNow()
  const t = countdownTarget(e, today)
  const left = t.at - now
  if (left <= 0) {
    return <p className="bb-count bb-count--done t-label">{t.short === '開賽' ? '今天比賽，祝順利完賽！' : '時間到了，請以報名網站為準'}</p>
  }
  const { d, h, m, s } = splitTime(left)
  return (
    <div className="bb-count" data-urgent={t.short === '截止' && left < URGENT} role="timer" aria-label={`${t.label}還有 ${d} 天 ${h} 小時 ${m} 分`}>
      <div className="bb-count__head t-label" aria-hidden="true">
        <span>{t.label}</span>
        <span className="bb-count__until">{t.until}</span>
      </div>
      <div className="bb-count__cells" aria-hidden="true">
        {[
          [d, '天'],
          [h, '時'],
          [m, '分'],
          [s, '秒'],
        ].map(([n, u]) => (
          <span key={u} className="bb-count__cell">
            <span className="bb-count__num">{typeof n === 'number' && u !== '天' ? pad(n) : n}</span>
            <span className="t-caption">{u}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// 列表上要不要放精簡版：報名中、剩 30 天內才放（呼叫端先確認是報名中）
export const inListRange = (e: RaceEvent, today: string) => countdownTarget(e, today).at - Date.now() <= COUNTDOWN_LIST_DAYS * 86_400_000

// 列表上的精簡版，例如「截止 7天 12:45:09」
export function CountdownChip({ e, today }: { e: RaceEvent; today: string }) {
  const now = useNow()
  const t = countdownTarget(e, today)
  const left = t.at - now
  if (left <= 0) return <span className="bb-chipcount">{t.short === '開賽' ? '今天比賽' : '時間到'}</span>
  const { d, h, m, s } = splitTime(left)
  return (
    <span className="bb-chipcount" data-urgent={t.short === '截止' && left < URGENT}>
      <span className="bb-chipcount__label">{t.short}倒數</span>
      <span className="bb-chipcount__num">
        {d > 0 && <>{d}<small>天</small> </>}
        {pad(h)}:{pad(m)}:{pad(s)}
      </span>
    </span>
  )
}
