import { useEffect, useRef, useState } from 'react'
import { CountdownChip, CountdownPanel, inListRange } from './Countdown'
import { SOURCES, dateParts, distances, feeFrom, feeRange, km, mapsUrl, safeUrl, signupStatus, type RaceEvent } from './data'

// 線條圖示：18px、currentColor、圓角端點
const PinIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
)
const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h8" />
  </svg>
)
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

// 設計規範：距離徽章，最長的實心、其餘同色系淡底
export function Distances({ e }: { e: RaceEvent }) {
  const list = distances(e)
  if (!list.length) return null
  return (
    <span className="bb-dists">
      {list.map((d) => (
        <span key={d} className="bb-dist">
          {km(d)}K
        </span>
      ))}
    </span>
  )
}

// 報名狀態固定放在第三行，位置一致才好掃：報名中且 30 天內截止的直接放計時器
function SignupStatus({ e, today }: { e: RaceEvent; today: string }) {
  const md = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}`
  const st = signupStatus(e, today)
  if (st === '已截止') return <span className="bb-status bb-status--closed">報名已截止</span>
  if (st === '即將開放') return <span className="bb-status bb-status--soon">{md(e.signup_open!)} 開放報名</span>
  if (!e.signup_close) return <span className="bb-status">截止日未公布</span>
  if (inListRange(e, today)) return <CountdownChip e={e} today={today} />
  return <span className="bb-status">報名中・{md(e.signup_close)} 截止</span>
}

export function RaceHead({ e, today, open, onClick }: { e: RaceEvent; today: string; open?: boolean; onClick: () => void }) {
  const { mm, dd, dow } = dateParts(e.race_date)
  const from = feeFrom(e)
  return (
    <button type="button" className="bb-race__head" aria-expanded={open} onClick={onClick}>
      <span className="bb-race__date">
        <span className="t-date-l">
          {mm}
          <i>/</i>
          {dd}
        </span>
        <span className="t-caption">{dow}</span>
      </span>
      <span className="bb-race__main">
        <span className="bb-race__name t-title">{e.name}</span>
        <span className="bb-race__meta t-label">
          {e.sport && <span className="bb-sport">{e.sport}</span>}
          <Distances e={e} />
          {from && <span>{from}</span>}
        </span>
        <span className="bb-race__status t-label">
          <SignupStatus e={e} today={today} />
        </span>
      </span>
    </button>
  )
}

// 完整主視覺彈窗：點任一處、左右鍵、Esc、滾輪都關閉
function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (!d.open) d.showModal()
    d.addEventListener('close', onClose)
    return () => d.removeEventListener('close', onClose)
  }, [onClose])
  // 自己關的時候直接通知，不等原生 close 事件（它跟著畫面更新才送出，可能延遲）
  const close = () => {
    ref.current?.close()
    onClose()
  }
  return (
    <dialog
      ref={ref}
      className="bb-lightbox"
      aria-label={alt}
      onClick={close}
      onWheel={close}
      onKeyDown={(k) => {
        k.stopPropagation() // 不讓 Esc 連右側選單一起收起來
        if (['ArrowLeft', 'ArrowRight', 'Escape'].includes(k.key)) {
          k.preventDefault()
          close()
        }
      }}
    >
      <img src={src} alt={alt} referrerPolicy="no-referrer" />
      <p className="t-caption">點任一處、按左右鍵或捲動滾輪關閉</p>
    </dialog>
  )
}

// 設計規範 EventVisual：有官方主視覺就放圖（點開看完整圖片），載入失敗或沒有圖時改用運動色主視覺
export function EventVisual({ e }: { e: RaceEvent }) {
  const [broken, setBroken] = useState(false)
  const [full, setFull] = useState(false)
  const img = safeUrl(e.image_url)
  const longest = distances(e)[0]
  if (img && !broken) {
    const alt = `${e.name} 主視覺`
    return (
      <>
        <button type="button" className="bb-visual bb-visual--zoom" data-sport={e.sport ?? undefined} aria-label={`查看完整主視覺：${e.name}`} onClick={() => setFull(true)}>
          <img src={img} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
          <span className="bb-visual__hint t-caption" aria-hidden="true">
            完整圖片
          </span>
        </button>
        {full && <Lightbox src={img} alt={alt} onClose={() => setFull(false)} />}
      </>
    )
  }
  return (
    <div className="bb-visual" data-sport={e.sport ?? undefined}>
      <span className="bb-visual__label t-label">
        {e.sport && <span className="bb-sport">{e.sport}</span>}
        <span>{e.county}</span>
      </span>
      {longest !== undefined && <span className="bb-visual__num">{km(longest)}K</span>}
    </div>
  )
}

function Venue({ e }: { e: RaceEvent }) {
  const [copied, setCopied] = useState(false)
  const text = e.venue ?? ''
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 不能寫入剪貼簿時，改成選取地址讓使用者自己複製
      const node = document.getElementById(`venue-${e.id}`)
      if (node) getSelection()?.selectAllChildren(node)
    }
  }
  return (
    <div className="bb-venue">
      <span id={`venue-${e.id}`} className="bb-venue__text t-body">
        {text}
      </span>
      <a className="bb-icon-btn bb-icon-btn--s" href={mapsUrl(e)} target="_blank" rel="noopener noreferrer" aria-label="在 Google 地圖開啟地點" title="在 Google 地圖開啟">
        <PinIcon />
      </a>
      <button type="button" className="bb-icon-btn bb-icon-btn--s" data-done={copied} aria-label={copied ? '已複製地點' : '複製地點'} title={copied ? '已複製' : '複製地點'} onClick={copy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? '已複製地點' : ''}
      </span>
    </div>
  )
}

type Props = { e: RaceEvent; today: string; open: boolean; onToggle: () => void }

// 設計規範 RaceRow：左日期、右名稱與一行重點，點一下在原地展開成詳細卡
export default function RaceRow({ e, today, open, onToggle }: Props) {
  // 展開過才載入主視覺，收合時保留，避免收合動畫跳動
  const [seen, setSeen] = useState(open)
  if (open && !seen) setSeen(true)
  const price = feeRange(e)
  const signup = safeUrl(e.signup_url)
  const official = safeUrl(e.official_url)
  const social = safeUrl(e.social_url)
  const period = e.signup_open || e.signup_close ? `${e.signup_open ?? ''}～${e.signup_close ?? ''}`.replaceAll('-', '/') : null

  return (
    <li
      className="bb-race"
      data-sport={e.sport ?? undefined}
      data-open={open}
      data-closed={signupStatus(e, today) === '已截止' || undefined}
      id={`race-${e.id}`}
    >
      <RaceHead e={e} today={today} open={open} onClick={onToggle} />
      <div className="bb-race__body" inert={!open}>
        <div>
          <div className="bb-detail">
            {seen && <EventVisual e={e} />}
            {seen && <CountdownPanel e={e} today={today} />}
            {e.venue && <Venue e={e} />}
            <dl className="bb-facts t-body">
              {e.distances_km.length > 0 && (
                <div>
                  <dt className="t-label">距離</dt>
                  <dd>
                    <Distances e={e} />
                  </dd>
                </div>
              )}
              {price && (
                <div>
                  <dt className="t-label">報名費</dt>
                  <dd>{price}</dd>
                </div>
              )}
              {e.souvenirs && (
                <div>
                  <dt className="t-label">紀念品</dt>
                  <dd>{e.souvenirs}</dd>
                </div>
              )}
              {period && (
                <div>
                  <dt className="t-label">報名期間</dt>
                  <dd>{period}</dd>
                </div>
              )}
            </dl>
            {e.tags.length > 0 && (
              <ul className="bb-tags t-label" aria-label="賽事性質">
                {e.tags.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
            <div className="bb-actions">
              {signup && (
                <a className="bb-btn bb-btn--primary" href={signup} target="_blank" rel="noopener noreferrer">
                  {/* 運動筆記行事曆上還沒有報名連結的賽事，連的是資訊頁不是報名頁 */}
                  {signup.startsWith('https://running.biji.co/') ? '查看賽事資訊' : '前往報名'}
                </a>
              )}
              {official && (
                <a className="bb-btn" href={official} target="_blank" rel="noopener noreferrer">
                  官方網站
                </a>
              )}
              {social && (
                <a className="bb-btn" href={social} target="_blank" rel="noopener noreferrer">
                  粉絲專頁
                </a>
              )}
            </div>
            <p className="bb-source t-caption">資料來源：{SOURCES[e.source] ?? e.source}</p>
          </div>
        </div>
      </div>
    </li>
  )
}
