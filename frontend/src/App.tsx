import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import Filters from './Filters'
import RaceDrawer from './RaceDrawer'
import { RaceHead } from './RaceRow'
import TaiwanMap from './TaiwanMap'
import { matches, readFilters, seasonOf, signupStatus, todayInTaiwan, writeFilters, type Filters as F, type RaceEvent } from './data'

const EMPTY: F = { county: null, q: '', month: [], sport: [], dist: [], tag: [], status: [] }

function summarize(f: F) {
  const parts = [...f.status, ...f.month.map((m) => `${m}月`), ...f.sport, ...f.dist.map((d) => d.split(':')[1]), ...f.tag]
  if (f.q.trim()) parts.unshift(`「${f.q.trim()}」`)
  return parts.length ? parts.join('、') : '全部條件'
}

export default function App() {
  const [events, setEvents] = useState<RaceEvent[] | null>(null)
  const [error, setError] = useState(false)
  const [filters, setFilters] = useState<F>(() => readFilters(location.search))
  const [drawer, setDrawer] = useState(() => filters.county !== null)
  const [openId, setOpenId] = useState<number | null>(null)
  const sky = useRef<HTMLDivElement>(null)
  const frame = useRef(0)
  const mapBox = useRef<HTMLElement>(null)
  const today = todayInTaiwan()

  useEffect(() => {
    fetch('/api/events')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setEvents)
      .catch(() => setError(true))
  }, [])

  const update = useCallback((f: F) => {
    setFilters(f)
    history.replaceState(null, '', writeFilters(f))
  }, [])

  const selectCounty = (county: string | null) => {
    update({ ...filters, county })
    setOpenId(null)
    setDrawer(true)
  }
  const closeDrawer = useCallback(() => {
    setDrawer(false)
    setOpenId(null)
    setFilters((f) => {
      const next = { ...f, county: null }
      history.replaceState(null, '', writeFilters(next))
      return next
    })
  }, [])

  // 選單開著時地圖要往左讓多少：讓地圖置中在「左欄右緣到選單左緣」之間，但不壓到左欄
  useLayoutEffect(() => {
    const fit = () => {
      const el = mapBox.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const w = Math.min(r.width, (r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) * (400 / 560))
      const left = r.left + (r.width - w) / 2
      const target = (r.left + innerWidth - Math.min(460, innerWidth) - w) / 2
      el.style.setProperty('--shift', `${Math.max(0, Math.min(left - target, left - r.left))}px`)
    }
    fit()
    addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  }, [])

  // 頭燈：游標位置寫進背景的 CSS 變數，用 requestAnimationFrame 節流
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    const { clientX, clientY } = e
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      sky.current?.style.setProperty('--mx', `${clientX}px`)
      sky.current?.style.setProperty('--my', `${clientY}px`)
    })
  }

  // 地圖上的數字用「縣市以外」的篩選條件算，才看得出別的縣市有多少場
  const pool = useMemo(() => (events ?? []).filter((e) => matches(e, filters, today, true)), [events, filters, today])
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of pool) c[e.county] = (c[e.county] ?? 0) + 1
    return c
  }, [pool])
  // 右側選單：比賽日由新到舊（API 照日期由近到遠回傳，「最近可報名」靠這個順序，所以只在這裡反過來）
  const shown = (filters.county ? pool.filter((e) => e.county === filters.county) : pool)
    .slice()
    .sort((a, b) => b.race_date.localeCompare(a.race_date) || b.id - a.id)
  // 沒有截止日的不列：多半是報名時間未定，不能說它可報名
  const open = pool.filter((e) => e.signup_close && signupStatus(e, today) === '報名中').slice(0, 3)
  const season = filters.month.length === 1 ? seasonOf(Number(filters.month[0])) : undefined

  return (
    <div className="home" data-drawer={drawer} onPointerMove={onPointerMove}>
      <div ref={sky} className="bb-sky" data-season={season} aria-hidden="true">
        <span className="bb-sky__stars" />
        <span className="bb-sky__sun" />
      </div>

      <header className="home-bar">
        <span className="t-wordmark">BB SIGN</span>
        <span className="t-caption">台灣賽事報名資訊，每天更新</span>
      </header>

      <section className="home-panel" aria-labelledby="headline">
        <h1 id="headline" className="t-headline">
          選一個縣市，
          <br />
          找下一場比賽。
        </h1>
        <p className="home-lede t-body">
          {error
            ? '賽事資料載入失敗，請重新整理頁面。'
            : events
              ? `目前有 ${pool.length} 場符合條件的路跑、自行車、三鐵賽事。`
              : '正在載入賽事…'}
        </p>

        <Filters value={filters} onChange={update} onSubmit={() => selectCounty(null)} />

        {open.length > 0 && (
          <div className="home-next">
            <h2 className="t-label">最近可報名的比賽</h2>
            <ul>
              {open.map((e) => (
                <li key={e.id} className="bb-race" data-sport={e.sport ?? undefined}>
                  <RaceHead
                    e={e}
                    today={today}
                    onClick={() => {
                      update({ ...filters, county: e.county })
                      setDrawer(true)
                      setOpenId(e.id)
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="home-actions">
          <button type="button" className="bb-btn" disabled={!pool.length} onClick={() => selectCounty(null)}>
            看全部 {pool.length} 場
          </button>
          {JSON.stringify({ ...filters, county: null }) !== JSON.stringify(EMPTY) && (
            <button type="button" className="bb-btn bb-btn--quiet" onClick={() => update({ ...EMPTY, county: filters.county })}>
              清除篩選
            </button>
          )}
        </div>
      </section>

      <main className="home-map" ref={mapBox}>
        <TaiwanMap counts={counts} selected={filters.county} onSelect={(c) => (c === filters.county ? closeDrawer() : selectCounty(c))} />
      </main>

      <footer className="home-foot t-caption">
        資料整理自全統運動、中華民國路跑協會、筆記報名、樂活報名網、眾點資訊、運動筆記。名額、費用與最新公告以各報名網站為準。
      </footer>

      <RaceDrawer
        open={drawer}
        title={filters.county ?? '全台'}
        summary={`${shown.length} 場賽事　${summarize(filters)}`}
        events={shown}
        today={today}
        openId={openId}
        onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))}
        onClose={closeDrawer}
        onClear={() => update({ ...EMPTY, county: filters.county })}
      />
    </div>
  )
}
