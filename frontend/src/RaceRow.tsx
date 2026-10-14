import { useEffect, useRef, useState } from 'react'
import { CountdownChip, CountdownPanel, inListRange } from './Countdown'
import RaceWeather from './weather/RaceWeather'
import { SOURCES, dateParts, distances, feeFrom, feeRange, km, mapsUrl, safeUrl, signupStatus, sportLabel, type RaceEvent } from './data'

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

// 設計規範：距離徽章，最長的實心、其餘同色系淡底；pace 時路跑的每個距離連到配速計算
export function Distances({ e, pace }: { e: RaceEvent; pace?: boolean }) {
  const list = distances(e)
  if (!list.length) return null
  const link = pace && e.sport === '路跑'
  return (
    <span className="bb-dists">
      {list.map((d) =>
        link ? (
          <a key={d} className="bb-dist" href={`/pace?d=${d}`} target="_blank" title={`算 ${km(d)}K 配速`}>
            {km(d)}K
          </a>
        ) : (
          <span key={d} className="bb-dist">
            {km(d)}K
          </span>
        ),
      )}
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

export function RaceHead({ e, today, onClick }: { e: RaceEvent; today: string; onClick: () => void }) {
  const { mm, dd, dow } = dateParts(e.race_date)
  const from = feeFrom(e)
  return (
    <button type="button" className="bb-race__head" aria-haspopup="dialog" onClick={onClick}>
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
          {e.sport && <span className="bb-sport">{sportLabel(e.sport)}</span>}
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
        k.stopPropagation() // 不讓 Esc 連詳細彈窗一起關掉
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
        {e.sport && <span className="bb-sport">{sportLabel(e.sport)}</span>}
        <span>{e.county}</span>
      </span>
      {longest !== undefined && <span className="bb-visual__num">{km(longest)}K</span>}
    </div>
  )
}

// 路線圖彈窗：地圖和海拔圖是 Ride with GPS／Garmin Connect 的嵌入頁，第一次打開才載入
function Routes({ e }: { e: RaceEvent }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [i, setI] = useState<number | null>(null)
  const routes = (e.routes ?? []).filter((r) => safeUrl(r.url))
  if (!routes.length) return null
  const open = () => {
    setI((n) => n ?? 0)
    ref.current?.showModal()
    fetch(`/api/route-view?id=${e.id}`, { method: 'POST' }).catch(() => {})
  }
  const close = () => ref.current?.close()
  return (
    <>
      <button type="button" className="bb-btn" aria-haspopup="dialog" onClick={open}>
        路線圖
      </button>
      {/* 點背景（dialog 本身）關閉；Esc 由瀏覽器處理，不往外傳以免右側選單一起收起來 */}
      <dialog
        ref={ref}
        className="bb-dialog bb-routes"
        aria-labelledby={`routes-${e.id}`}
        onClick={(k) => k.target === k.currentTarget && close()}
        onKeyDown={(k) => k.stopPropagation()}
      >
        <div className="bb-dialog__body">
          <header className="bb-dialog__head">
            <h2 id={`routes-${e.id}`} className="t-title">
              {e.name}
            </h2>
            <button type="button" className="bb-icon-btn bb-icon-btn--s bb-icon-btn--close" aria-label="關閉" onClick={close}>
              ×
            </button>
          </header>
          {routes.length > 1 && (
            <div className="bb-routes__tabs">
              {routes.map((r, n) => (
                <button key={r.url} type="button" className="bb-chip" aria-pressed={n === i} onClick={() => setI(n)}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
          {i !== null && (
            <div className="bb-routes__frame">
              <iframe src={routes[i].url} title={`${routes[i].label}路線與海拔`} />
            </div>
          )}
          <p className="t-caption">地圖與海拔由 Ride with GPS／Garmin Connect 提供。橋梁、隧道、高架路段的海拔僅供參考，路線以大會公告為準。</p>
        </div>
      </dialog>
    </>
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

// 設計規範 RaceRow：左日期、右名稱與一行重點，點一下開詳細彈窗
export default function RaceRow({ e, today, onOpen }: { e: RaceEvent; today: string; onOpen: () => void }) {
  return (
    <li className="bb-race" data-sport={e.sport ?? undefined} data-closed={signupStatus(e, today) === '已截止' || undefined}>
      <RaceHead e={e} today={today} onClick={onOpen} />
    </li>
  )
}

// 賽事詳細彈窗：所有清單（右側選單、最近可報名）共用。寬螢幕左圖右資訊兩欄、報名按鈕固定在底部；手機全螢幕
export function RaceDialog({ e, today, onClose }: { e: RaceEvent; today: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (!d.open) d.showModal()
    d.addEventListener('close', onClose)
    return () => d.removeEventListener('close', onClose)
  }, [onClose])
  const close = () => {
    ref.current?.close()
    onClose()
  }
  const { mm, dd, dow } = dateParts(e.race_date)
  const price = feeRange(e)
  const signup = safeUrl(e.signup_url)
  const official = safeUrl(e.official_url)
  const social = safeUrl(e.social_url)
  const period = e.signup_open || e.signup_close ? `${e.signup_open ?? ''}～${e.signup_close ?? ''}`.replaceAll('-', '/') : null

  return (
    // 點背景關閉；Esc 由瀏覽器處理，不往外傳以免右側選單一起收起來
    <dialog
      ref={ref}
      className="bb-dialog bb-event"
      data-sport={e.sport ?? undefined}
      aria-labelledby="event-title"
      onClick={(k) => k.target === k.currentTarget && close()}
      onKeyDown={(k) => k.stopPropagation()}
    >
      <header className="bb-event__head">
        <span className="bb-race__date">
          <span className="t-date-l">
            {mm}
            <i>/</i>
            {dd}
          </span>
          <span className="t-caption">{dow}</span>
        </span>
        <div className="bb-event__title">
          <h2 id="event-title" className="t-title-l">
            {e.name}
          </h2>
          <span className="bb-race__meta t-label">
            {e.sport && <span className="bb-sport">{sportLabel(e.sport)}</span>}
            <span>{e.county}</span>
            <SignupStatus e={e} today={today} />
          </span>
        </div>
        <button type="button" className="bb-icon-btn bb-icon-btn--s bb-icon-btn--close" aria-label="關閉" onClick={close}>
          ×
        </button>
      </header>
      <div className="bb-event__grid">
        <div className="bb-event__side">
          <EventVisual e={e} />
          <CountdownPanel e={e} today={today} />
          {e.tags.length > 0 && (
            <ul className="bb-tags t-label" aria-label="賽事性質">
              {e.tags.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="bb-event__info">
          {e.venue && <Venue e={e} />}
          <dl className="bb-facts t-body">
            {e.distances_km.length > 0 && (
              <div>
                <dt className="t-label">距離</dt>
                <dd>
                  <Distances e={e} pace />
                </dd>
              </div>
            )}
            {period && (
              <div>
                <dt className="t-label">報名期間</dt>
                <dd>{period}</dd>
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
            <RaceWeather e={e} today={today} />
          </dl>
        </div>
      </div>
      <footer className="bb-event__foot">
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
          <Routes e={e} />
        </div>
        <p className="bb-source t-caption">資料來源：{SOURCES[e.source] ?? e.source}</p>
      </footer>
    </dialog>
  )
}
