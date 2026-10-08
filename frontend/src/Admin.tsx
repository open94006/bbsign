import { useEffect, useState, type FormEvent } from 'react'
import { COUNTIES, SOURCES, SPORTS, TAGS, type RaceEvent } from './data'

type Row = RaceEvent & { is_race: boolean; hidden: boolean; locked: boolean; race_date: string | null; county: string | null }
const KEY = 'bbsign-admin-token'
const BLANK = {
  name: '', sport: '路跑', race_date: '', county: '', venue: '', distances_km: [], fee_min: null, fee_max: null,
  souvenirs: '', tags: [], signup_url: '', image_url: '', official_url: '', social_url: '', signup_open: '', signup_close: '',
  is_race: true, hidden: false,
} as unknown as Row

function getToken() {
  try {
    return sessionStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

async function api(path: string, token: string, init?: RequestInit) {
  const r = await fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  const body = await r.json().catch(() => null)
  if (!r.ok) {
    const detail = body?.detail
    throw new Error(typeof detail === 'string' ? detail : `儲存失敗：欄位格式不正確（${r.status}）`)
  }
  return body
}

export default function Admin() {
  const [token, setToken] = useState(getToken)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Row | null>(null)
  const [query, setQuery] = useState('')

  const load = (t = token) =>
    api('/api/admin/events', t)
      .then((r) => {
        setRows(r)
        setError('')
        try {
          sessionStorage.setItem(KEY, t)
        } catch {
          /* 無痕模式存不了就每次重新登入 */
        }
      })
      .catch((e) => {
        setRows(null)
        setError(e.message)
      })

  useEffect(() => {
    if (token) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!rows) {
    return (
      <main className="admin">
        <h1>BB Sign 管理頁</h1>
        <form
          className="admin-login"
          onSubmit={(e) => {
            e.preventDefault()
            load()
          }}
        >
          <label>
            管理密碼
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="current-password" required />
          </label>
          <button className="bb-btn bb-btn--primary">登入</button>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      </main>
    )
  }

  if (editing) {
    return (
      <main className="admin">
        <EventForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={async (body) => {
            await api(editing.id ? `/api/admin/events/${editing.id}` : '/api/admin/events', token, {
              method: editing.id ? 'PUT' : 'POST',
              body: JSON.stringify(body),
            })
            setEditing(null)
            await load()
          }}
        />
      </main>
    )
  }

  const q = query.trim()
  const list = rows.filter((r) => !q || r.name.includes(q) || (r.county ?? '').includes(q))
  return (
    <main className="admin">
      <div className="admin-head">
        <h1>BB Sign 管理頁</h1>
        <button className="bb-btn bb-btn--primary" onClick={() => setEditing(BLANK)}>新增賽事</button>
        <button
          className="bb-btn bb-btn--quiet"
          onClick={() => {
            try {
              sessionStorage.removeItem(KEY)
            } catch {
              /* 存不了就沒東西要清 */
            }
            setToken('')
            setRows(null)
          }}
        >
          登出
        </button>
      </div>
      <p className="admin-note">改過的賽事會鎖定，之後爬蟲不會覆蓋。不想顯示的賽事請勾「隱藏」，不要刪除，否則隔天爬蟲又會加回來。</p>
      <Crawl token={token} onDone={() => load()} />
      <input className="admin-search" type="search" placeholder="搜尋賽事名稱或縣市" value={query} onChange={(e) => setQuery(e.target.value)} />
      <table className="admin-table">
        <thead>
          <tr>
            <th>比賽日</th>
            <th>名稱</th>
            <th>縣市</th>
            <th>來源</th>
            <th>狀態</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id} className={r.hidden || !r.is_race || !r.county ? 'muted' : ''}>
              <td>{r.race_date ?? '未填'}</td>
              <td>{r.name}</td>
              <td>{r.county ?? '未填'}</td>
              <td>{SOURCES[r.source] ?? r.source}</td>
              <td>
                {[r.hidden && '隱藏', !r.is_race && '非賽事', !r.county && '不在台灣', r.locked && '已鎖定'].filter(Boolean).join('、')}
              </td>
              <td>
                <button className="bb-btn bb-btn--quiet" onClick={() => setEditing(r)}>編輯</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}

type Execution = { name: string; createTime: string; completionTime?: string; completionStatus?: string } | null
const STATUS: Record<string, string> = {
  EXECUTION_SUCCEEDED: '完成', EXECUTION_FAILED: '失敗', EXECUTION_CANCELLED: '已取消',
}

function Crawl({ token, onDone }: { token: string; onDone: () => void }) {
  const [last, setLast] = useState<Execution | undefined>()
  const [msg, setMsg] = useState('')
  const running = !!last && !last.completionTime

  const refresh = () =>
    api('/api/admin/crawl', token)
      .then((e: Execution) => {
        if (running && e?.completionTime) onDone()
        setLast(e)
        setMsg('')
      })
      .catch((e) => setMsg(e.message))

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ponytail: 執行中每 15 秒輪詢一次；爬一次約幾分鐘，不需要推播
  useEffect(() => {
    if (!running) return
    const t = setInterval(refresh, 15000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, last?.name])

  const start = (isNew: boolean) =>
    api(`/api/admin/crawl${isNew ? '?new=true' : ''}`, token, { method: 'POST' })
      .then((e: Execution) => setLast(e))
      .catch((e) => setMsg(e.message))

  const when = (s?: string) => (s ? new Date(s).toLocaleString('zh-TW', { hour12: false }) : '')
  return (
    <div className="admin-crawl">
      <button className="bb-btn" disabled={running} onClick={() => start(true)}>只抓新賽事</button>
      <button className="bb-btn" disabled={running} onClick={() => start(false)}>完整更新</button>
      {!msg && <span>
        {last === undefined ? '讀取爬蟲狀態…'
          : !last ? '還沒執行過爬蟲'
          : running ? `執行中（${when(last.createTime)} 開始）…`
          : `上次：${when(last.completionTime)} ${STATUS[last.completionStatus ?? ''] ?? last.completionStatus ?? ''}`}
      </span>}
      {msg && <p className="error" role="alert">{msg}</p>}
    </div>
  )
}

function EventForm({ initial, onSave, onCancel }: { initial: Row; onSave: (b: object) => Promise<void>; onCancel: () => void }) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const text = (k: string) => String(f.get(k) ?? '').trim() || null
    const num = (k: string) => (text(k) === null ? null : Number(text(k)))
    const body = {
      name: text('name'), sport: text('sport'), race_date: text('race_date'), county: text('county'), venue: text('venue'),
      distances_km: (text('distances_km') ?? '').split(/[,，、\s]+/).filter(Boolean).map(Number),
      fee_min: num('fee_min'), fee_max: num('fee_max'), souvenirs: text('souvenirs'), tags: f.getAll('tags'),
      signup_url: text('signup_url'), image_url: text('image_url'), official_url: text('official_url'), social_url: text('social_url'),
      signup_open: text('signup_open'), signup_close: text('signup_close'),
      is_race: f.get('is_race') === 'on', hidden: f.get('hidden') === 'on',
    }
    setSaving(true)
    try {
      await onSave(body)
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  const v = (k: keyof Row) => (initial[k] as string | number | null) ?? ''
  return (
    <form className="admin-form" onSubmit={submit}>
      <h1>{initial.id ? '編輯賽事' : '新增賽事'}</h1>
      <label className="wide">名稱<input name="name" defaultValue={v('name')} required /></label>
      <label>運動
        <select name="sport" defaultValue={v('sport')}>
          {SPORTS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label>比賽日<input name="race_date" type="date" defaultValue={v('race_date')} required /></label>
      <label>縣市
        <select name="county" defaultValue={v('county')} required>
          <option value="">請選擇</option>
          {COUNTIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label className="wide">地點<input name="venue" defaultValue={v('venue')} /></label>
      <label className="wide">距離（公里，用逗號分隔）<input name="distances_km" defaultValue={initial.distances_km.join(', ')} placeholder="5, 10, 21.0975" /></label>
      <label>最低報名費<input name="fee_min" type="number" min="0" defaultValue={v('fee_min')} /></label>
      <label>最高報名費<input name="fee_max" type="number" min="0" defaultValue={v('fee_max')} /></label>
      <label className="wide">紀念品<input name="souvenirs" defaultValue={v('souvenirs')} /></label>
      <fieldset className="wide">
        <legend>賽事性質</legend>
        {TAGS.map((t) => (
          <label key={t} className="check"><input type="checkbox" name="tags" value={t} defaultChecked={initial.tags.includes(t)} />{t}</label>
        ))}
      </fieldset>
      <label className="wide">報名網址<input name="signup_url" type="url" defaultValue={v('signup_url')} required /></label>
      <label className="wide">主視覺圖片網址<input name="image_url" type="url" defaultValue={v('image_url')} /></label>
      <label className="wide">官方網站<input name="official_url" type="url" defaultValue={v('official_url')} /></label>
      <label className="wide">粉絲專頁<input name="social_url" type="url" defaultValue={v('social_url')} /></label>
      <label>報名開始<input name="signup_open" type="date" defaultValue={v('signup_open')} /></label>
      <label>報名截止<input name="signup_close" type="date" defaultValue={v('signup_close')} /></label>
      <label className="check"><input type="checkbox" name="is_race" defaultChecked={initial.is_race} />是實體賽事</label>
      <label className="check"><input type="checkbox" name="hidden" defaultChecked={initial.hidden} />隱藏（不在前台顯示）</label>
      {error && <p className="error wide" role="alert">{error}</p>}
      <div className="wide admin-actions">
        <button className="bb-btn bb-btn--primary" disabled={saving}>{saving ? '儲存中…' : '儲存賽事'}</button>
        <button type="button" className="bb-btn" onClick={onCancel}>取消</button>
      </div>
    </form>
  )
}
