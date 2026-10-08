export type Sport = '路跑' | '自行車' | '三鐵'

export type RaceEvent = {
  id: number
  name: string
  sport: Sport | null
  race_date: string
  county: string
  venue: string | null
  distances_km: number[]
  fee_min: number | null
  fee_max: number | null
  souvenirs: string | null
  tags: string[]
  signup_url: string
  image_url: string | null
  official_url: string | null
  social_url: string | null
  signup_open: string | null
  signup_close: string | null
  source: string
}

export const COUNTIES = [
  '臺北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '臺中市',
  '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣',
  '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣',
]
export const SPORTS: Sport[] = ['路跑', '自行車', '三鐵']
export const TAGS = ['認證賽事', '越野／山徑', '公益／親子', '夜跑／主題趣味跑', '其他']
export const STATUSES = ['報名中', '即將開放', '已截止'] as const
// 背景天色仍依季節變化：只選一個月份時換成那個季節的顏色
export const SEASONS: Record<string, number[]> = { 春: [3, 4, 5], 夏: [6, 7, 8], 秋: [9, 10, 11], 冬: [12, 1, 2] }
export const seasonOf = (month: number) => Object.keys(SEASONS).find((s) => SEASONS[s].includes(month))
// 每個區間是 (下限, 上限]，單位公里；三鐵用三項加總距離
export const DISTANCES: Record<Sport, [string, number, number][]> = {
  路跑: [['10K 以下', 0, 10.5], ['半馬', 10.5, 25], ['全馬', 25, 43], ['超馬', 43, Infinity]],
  自行車: [['100K 以下', 0, 99.9], ['100K 以上', 99.9, Infinity]],
  三鐵: [['標鐵以下', 0, 60], ['半程超鐵', 60, 150], ['超鐵', 150, Infinity]],
}
export const SOURCES: Record<string, string> = {
  ctrun: '全統運動', sportsnet: '中華民國路跑協會', biji: '筆記報名',
  lohasnet: '樂活報名網', focusline: '眾點資訊', bijical: '運動筆記', manual: 'BB Sign 編輯整理',
}

export type Filters = { county: string | null; q: string; month: string[]; sport: string[]; dist: string[]; tag: string[]; status: string[] }
const LIST_KEYS = ['month', 'sport', 'dist', 'tag', 'status'] as const

export function readFilters(search: string): Filters {
  const p = new URLSearchParams(search)
  const list = (k: string) => p.get(k)?.split(',').filter(Boolean) ?? []
  return { county: p.get('county'), q: p.get('q') ?? '', month: list('month'), sport: list('sport'), dist: list('dist'), tag: list('tag'), status: list('status') }
}

export function writeFilters(f: Filters): string {
  const p = new URLSearchParams()
  if (f.county) p.set('county', f.county)
  if (f.q.trim()) p.set('q', f.q)
  for (const k of LIST_KEYS) if (f[k].length) p.set(k, f[k].join(','))
  const s = p.toString()
  return s ? `?${s}` : location.pathname
}

// 沒有截止日的賽事當作還能報名
export function signupStatus(e: RaceEvent, today: string): (typeof STATUSES)[number] {
  if (e.signup_close && e.signup_close < today) return '已截止'
  if (e.signup_open && e.signup_open > today) return '即將開放'
  return '報名中'
}

// 搜尋時不分大小寫、台／臺、空白
const norm = (s: string) => s.toLowerCase().replaceAll('臺', '台').replace(/\s+/g, '')

export function matches(e: RaceEvent, f: Filters, today: string, ignoreCounty = false): boolean {
  const month = Number(e.race_date.slice(5, 7))
  return (
    (ignoreCounty || !f.county || e.county === f.county) &&
    (!f.q.trim() || norm(e.name).includes(norm(f.q))) &&
    (!f.status.length || f.status.includes(signupStatus(e, today))) &&
    (!f.month.length || f.month.includes(String(month))) &&
    (!f.sport.length || (e.sport !== null && f.sport.includes(e.sport))) &&
    (!f.tag.length || e.tags.some((t) => f.tag.includes(t))) &&
    (!f.dist.length ||
      f.dist.some((key) => {
        const [sport, label] = key.split(':')
        const range = DISTANCES[sport as Sport]?.find(([l]) => l === label)
        return e.sport === sport && !!range && e.distances_km.some((d) => d > range[1] && d <= range[2])
      }))
  )
}

export const safeUrl = (u: string | null) => (u && /^https?:\/\//.test(u) ? u : undefined)

export function todayInTaiwan(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
}

// ---------- 顯示格式（設計規範「文案」一節） ----------

const WEEKDAYS = '日一二三四五六'
const DAY = 86_400_000

export const km = (d: number) => (Math.abs(d - 42.195) < 0.01 ? '42.195' : String(Number(d.toFixed(1))))
const money = (n: number) => n.toLocaleString('zh-TW')
const price = (n: number) => (n === 0 ? '免費' : `NT$ ${money(n)}`)

export function dateParts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return { y, mm: String(m).padStart(2, '0'), dd: String(d).padStart(2, '0'), dow: `週${dow}` }
}

export function feeRange(e: RaceEvent) {
  if (e.fee_min === null && e.fee_max === null) return null
  const [lo, hi] = [e.fee_min ?? e.fee_max!, e.fee_max ?? e.fee_min!]
  return lo === hi ? price(lo) : lo === 0 ? `免費–NT$ ${money(hi)}` : `NT$ ${money(lo)}–${money(hi)}`
}

export function feeFrom(e: RaceEvent) {
  const lo = e.fee_min ?? e.fee_max
  return lo === null ? null : lo === 0 ? '有免費組別' : `${price(lo)} 起`
}

// 長的距離在前、去掉重複（同距離的不同組別）
export const distances = (e: RaceEvent) => [...new Set(e.distances_km)].sort((a, b) => b - a)

export function mapsUrl(e: RaceEvent) {
  const place = e.venue ?? ''
  const q = place.replace('台', '臺').includes(e.county) ? place : `${e.county} ${place}`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q.trim())}`
}

// ---------- 倒數計時 ----------

// 台灣時間某天 00:00 的時間戳
const midnight = (d: string) => Date.parse(`${d}T00:00:00+08:00`)

export type Countdown = { label: string; short: string; at: number; until: string }

// 倒數目標跟著報名狀態走：還沒開放→開放報名；報名中→截止（當天 23:59:59 結束）；其餘→比賽日
export function countdownTarget(e: RaceEvent, today: string): Countdown {
  const md = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}`
  if (e.signup_open && e.signup_open > today)
    return { label: '距離開放報名', short: '開放', at: midnight(e.signup_open), until: `${md(e.signup_open)} 00:00 開放` }
  if (e.signup_close && e.signup_close >= today)
    return { label: '距離報名截止', short: '截止', at: midnight(e.signup_close) + DAY, until: `${md(e.signup_close)} 23:59 截止` }
  return { label: '距離比賽日', short: '開賽', at: midnight(e.race_date), until: `${md(e.race_date)} 比賽當天` }
}

export function splitTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 }
}

export const COUNTDOWN_LIST_DAYS = 30
