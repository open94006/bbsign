import { format, parseISO } from 'date-fns'
import { CalendarIcon, ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { zhTW } from 'react-day-picker/locale'
import './admin.css'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
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

const Shell = ({ children }: { children: ReactNode }) => <main className="mx-auto max-w-[1100px] px-4 pt-6 pb-16 text-sm">{children}</main>
const ErrorText = ({ children }: { children: ReactNode }) => <p className="text-destructive" role="alert">{children}</p>

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
      <Shell>
        <h1 className="text-2xl font-black">BB Sign 管理頁</h1>
        <form
          className="mt-6 grid max-w-xs gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            load()
          }}
        >
          <Label htmlFor="token">管理密碼</Label>
          <Input id="token" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="current-password" required />
          <Button>登入</Button>
          {error && <ErrorText>{error}</ErrorText>}
        </form>
      </Shell>
    )
  }

  if (editing) {
    return (
      <Shell>
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
      </Shell>
    )
  }

  const q = query.trim()
  const list = rows.filter((r) => !q || r.name.includes(q) || (r.county ?? '').includes(q))
  return (
    <Shell>
      <div className="flex items-center gap-3">
        <h1 className="mr-auto text-2xl font-black">BB Sign 管理頁</h1>
        <Button onClick={() => setEditing(BLANK)}>新增賽事</Button>
        <Button
          variant="ghost"
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
        </Button>
      </div>
      <p className="my-3 text-muted-foreground">改過的賽事會鎖定，之後爬蟲不會覆蓋。不想顯示的賽事請勾「隱藏」，不要刪除，否則隔天爬蟲又會加回來。</p>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" type="search" placeholder="搜尋賽事名稱或縣市" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <span className="text-muted-foreground">{list.length} 筆</span>
        <Crawl token={token} onDone={() => load()} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>比賽日</TableHead>
            <TableHead>名稱</TableHead>
            <TableHead>縣市</TableHead>
            <TableHead>來源</TableHead>
            <TableHead>狀態</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((r) => (
            <TableRow
              key={r.id}
              className={cn('cursor-pointer', (r.hidden || !r.is_race || !r.county) && 'text-muted-foreground')}
              onClick={() => setEditing(r)}
            >
              <TableCell className="tabular-nums">{r.race_date ?? '未填'}</TableCell>
              <TableCell className="whitespace-normal">{r.name}</TableCell>
              <TableCell>{r.county ?? '未填'}</TableCell>
              <TableCell>{SOURCES[r.source] ?? r.source}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {r.hidden && <Badge variant="secondary">隱藏</Badge>}
                  {!r.is_race && <Badge variant="secondary">非賽事</Badge>}
                  {!r.county && <Badge variant="destructive">不在台灣</Badge>}
                  {r.locked && <Badge variant="outline">已鎖定</Badge>}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm">編輯</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Shell>
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
    <div className="ml-auto flex items-center gap-3 text-muted-foreground">
      {msg ? <ErrorText>{msg}</ErrorText> : <span>
        {last === undefined ? '讀取爬蟲狀態…'
          : !last ? '還沒執行過爬蟲'
          : running ? `執行中（${when(last.createTime)} 開始）…`
          : `上次：${when(last.completionTime)} ${STATUS[last.completionStatus ?? ''] ?? last.completionStatus ?? ''}`}
      </span>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={running}>執行爬蟲<ChevronDownIcon /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => start(true)}>只抓新賽事</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => start(false)}>完整更新（較久）</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

const START_MONTH = new Date(2015, 0)
const END_MONTH = new Date(new Date().getFullYear() + 3, 11)

/** shadcn 日期選擇器；值放在隱藏 input 裡，讓 FormData 照常讀得到 */
function DateField({ name, label, initial, required }: { name: string; label: string; initial: string | null; required?: boolean }) {
  const [value, setValue] = useState(initial ?? '')
  const [open, setOpen] = useState(false)
  const date = value ? parseISO(value) : undefined
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <div className="relative">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button id={name} type="button" variant="outline" className={cn('w-full justify-start font-normal', !value && 'text-muted-foreground')}>
              <CalendarIcon />
              {date ? format(date, 'yyyy/MM/dd（EEEEE）', { locale: zhTW }) : '選擇日期'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={zhTW}
              captionLayout="dropdown"
              startMonth={START_MONTH}
              endMonth={END_MONTH}
              selected={date}
              defaultMonth={date}
              onSelect={(d) => {
                setValue(d ? format(d, 'yyyy-MM-dd') : '')
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
        {value && !required && (
          <Button type="button" variant="ghost" size="icon" aria-label={`清除${label}`} className="absolute top-0 right-0" onClick={() => setValue('')}>
            <XIcon />
          </Button>
        )}
        {/* ponytail: 用看不見的 input 撐 required，讓瀏覽器原生驗證也管得到日期 */}
        <input name={name} value={value} required={required} onChange={() => {}} tabIndex={-1} aria-hidden className="absolute inset-x-0 bottom-0 h-px opacity-0" />
      </div>
    </div>
  )
}

const Field = ({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) => (
  <Label className={cn('grid gap-1.5', wide && 'md:col-span-3')}>{label}{children}</Label>
)

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
    <form className="grid gap-4 md:grid-cols-3" onSubmit={submit}>
      <h1 className="text-2xl font-black md:col-span-3">{initial.id ? '編輯賽事' : '新增賽事'}</h1>
      <Field label="名稱" wide><Input name="name" defaultValue={v('name')} required /></Field>
      <div className="grid gap-1.5">
        <Label htmlFor="sport">運動</Label>
        <Select name="sport" defaultValue={initial.sport ?? undefined}>
          <SelectTrigger id="sport" className="w-full"><SelectValue placeholder="請選擇" /></SelectTrigger>
          <SelectContent>{SPORTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <DateField name="race_date" label="比賽日" initial={initial.race_date} required />
      <div className="grid gap-1.5">
        <Label htmlFor="county">縣市</Label>
        <Select name="county" defaultValue={initial.county || undefined} required>
          <SelectTrigger id="county" className="w-full"><SelectValue placeholder="請選擇" /></SelectTrigger>
          <SelectContent position="popper" className="max-h-72">{COUNTIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Field label="地點" wide><Input name="venue" defaultValue={v('venue')} /></Field>
      <Field label="距離（公里，用逗號分隔）" wide><Input name="distances_km" defaultValue={initial.distances_km.join(', ')} placeholder="5, 10, 21.0975" /></Field>
      <Field label="最低報名費"><Input name="fee_min" type="number" min="0" inputMode="numeric" defaultValue={v('fee_min')} /></Field>
      <Field label="最高報名費"><Input name="fee_max" type="number" min="0" inputMode="numeric" defaultValue={v('fee_max')} /></Field>
      <Field label="紀念品" wide><Input name="souvenirs" defaultValue={v('souvenirs')} /></Field>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2 rounded-md border p-3 md:col-span-3">
        <legend className="px-1">賽事性質</legend>
        {TAGS.map((t) => (
          <Label key={t} className="font-normal"><Checkbox name="tags" value={t} defaultChecked={initial.tags.includes(t)} />{t}</Label>
        ))}
      </fieldset>
      <Field label="報名網址" wide><Input name="signup_url" type="url" defaultValue={v('signup_url')} required /></Field>
      <Field label="主視覺圖片網址" wide><Input name="image_url" type="url" defaultValue={v('image_url')} /></Field>
      <Field label="官方網站" wide><Input name="official_url" type="url" defaultValue={v('official_url')} /></Field>
      <Field label="粉絲專頁" wide><Input name="social_url" type="url" defaultValue={v('social_url')} /></Field>
      <DateField name="signup_open" label="報名開始" initial={initial.signup_open} />
      <DateField name="signup_close" label="報名截止" initial={initial.signup_close} />
      <div className="flex flex-wrap gap-x-6 gap-y-2 md:col-span-3">
        <Label className="font-normal"><Checkbox name="is_race" defaultChecked={initial.is_race} />是實體賽事</Label>
        <Label className="font-normal"><Checkbox name="hidden" defaultChecked={initial.hidden} />隱藏（不在前台顯示）</Label>
      </div>
      {error && <div className="md:col-span-3"><ErrorText>{error}</ErrorText></div>}
      <div className="flex gap-3 md:col-span-3">
        <Button disabled={saving}>{saving ? '儲存中…' : '儲存賽事'}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
      </div>
    </form>
  )
}
