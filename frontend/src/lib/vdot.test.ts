import { describe, expect, it } from 'vitest'
import { formatPace } from './runningCondition'
import { analyze, formatClock, MARATHON_KM, parseInput, raceSec, trainingPaces, vdotOf } from './vdot'

const HM = MARATHON_KM / 2
const ok = (p: ReturnType<typeof parseInput>) => {
  if ('error' in p) throw new Error(p.error)
  return p
}
const err = (p: ReturnType<typeof parseInput>) => ('error' in p ? p.error : null)
const full = (p: ReturnType<typeof parseInput>) => {
  const { distanceKm, totalSec } = ok(p)
  const r = analyze(distanceKm, totalSec)
  if ('limit' in r) throw new Error(r.limit)
  return r
}
const hms = (s: string) => s.split(':').reduce((a, x) => a * 60 + Number(x), 0)

describe('parseInput - 輸入驗證', () => {
  it('完賽時間 → 秒；配速 × 距離 → 秒', () => {
    expect(ok(parseInput('10', 'time', ['0', '50', '0'], []))).toEqual({ distanceKm: 10, totalSec: 3000 })
    expect(ok(parseInput('42.195', 'pace', [], ['6', '00']))).toEqual({ distanceKm: 42.195, totalSec: 360 * 42.195 })
    expect(ok(parseInput('5', 'time', ['', '25', ''], []))).toEqual({ distanceKm: 5, totalSec: 1500 }) // 空欄當 0
  })

  it('零值', () => {
    expect(err(parseInput('0', 'time', ['0', '50', '0'], []))).toMatch('距離')
    expect(err(parseInput('10', 'time', ['0', '0', '0'], []))).toMatch('完賽時間')
    expect(err(parseInput('10', 'pace', [], ['0', '0']))).toMatch('配速')
    expect(err(parseInput('10', 'pace', [], ['', '']))).toMatch('配速')
  })

  it('負值與格式錯誤', () => {
    expect(err(parseInput('-5', 'time', ['0', '20', '0'], []))).toMatch('數字')
    expect(err(parseInput('abc', 'time', ['0', '20', '0'], []))).toMatch('數字')
    expect(err(parseInput('1.2.3', 'time', ['0', '20', '0'], []))).toMatch('數字')
    expect(err(parseInput('', 'time', ['0', '20', '0'], []))).toMatch('請輸入距離')
    expect(err(parseInput('10', 'time', ['0', '-5', '0'], []))).toMatch('整數')
    expect(err(parseInput('10', 'time', ['0', '5.5', '0'], []))).toMatch('整數')
    expect(err(parseInput('10', 'pace', [], ['5', 'x']))).toMatch('整數')
  })

  it('秒數、分鐘越界', () => {
    expect(err(parseInput('10', 'time', ['0', '50', '60'], []))).toMatch('0 到 59')
    expect(err(parseInput('10', 'time', ['0', '60', '0'], []))).toMatch('0 到 59')
    expect(err(parseInput('10', 'pace', [], ['5', '60']))).toMatch('0 到 59')
    expect(parseInput('10', 'time', ['0', '59', '59'], [])).not.toHaveProperty('error')
  })

  it('不合理距離', () => {
    expect(err(parseInput('0.05', 'time', ['0', '1', '0'], []))).toMatch('0.1 到 300')
    expect(err(parseInput('301', 'time', ['30', '0', '0'], []))).toMatch('0.1 到 300')
    expect(parseInput('.5', 'time', ['0', '2', '0'], [])).not.toHaveProperty('error')
  })
})

describe('基本換算：配速 = 時間 ÷ 距離、時間 = 配速 × 距離', () => {
  it('完賽時間模式算出配速', () => {
    const r = full(parseInput(String(HM), 'time', ['2', '0', '0'], []))
    expect(r.secPerKm).toBeCloseTo(7200 / HM, 9)
    expect(formatPace(r.secPerKm)).toBe(`5'41"`)
  })

  it('配速模式算出完賽時間', () => {
    const r = full(parseInput(String(MARATHON_KM), 'pace', [], ['5', '41']))
    expect(r.totalSec).toBeCloseTo(341 * MARATHON_KM, 9)
    expect(formatClock(r.totalSec)).toBe('3:59:48')
  })

  it('內部不先四捨五入：配速模式的配速與輸入完全一致，時間只在顯示時進位', () => {
    const r = full(parseInput(String(HM), 'pace', [], ['5', '41']))
    expect(formatPace(r.secPerKm)).toBe(`5'41"`)
    expect(r.totalSec).toBe(341 * HM) // 7194.2475，不是 7194
    expect(formatClock(r.totalSec)).toBe('1:59:54')
    expect(r.equivalents.find((e) => e.name === '半馬')?.sec).toBeCloseTo(r.totalSec, 3)
  })

  it('formatClock 進位到秒，跨分、跨時正確', () => {
    expect(formatClock(3599.6)).toBe('1:00:00')
    expect(formatClock(59.4)).toBe('0:00:59')
    expect(formatClock(12658.5)).toBe('3:30:59') // 全馬 5'00"：12658.5 秒
  })
})

describe('兩種輸入模式共用同一個引擎', () => {
  it.each([
    ['5', ['0', '25', '0'], ['5', '0']],
    ['10', ['0', '50', '0'], ['5', '0']],
    ['20', ['1', '40', '0'], ['5', '0']],
  ])('距離 %s：時間與配速等效時，結果完全相同', (d, time, pace) => {
    expect(full(parseInput(d, 'time', time, []))).toEqual(full(parseInput(d, 'pace', [], pace)))
  })

  it('配速模式算出的時間丟回時間模式的引擎，VDOT、等效成績、訓練配速都一樣', () => {
    for (const [d, pace] of [[HM, ['5', '41']], [MARATHON_KM, ['6', '15']], [15, ['4', '50']]] as const) {
      const fromPace = full(parseInput(String(d), 'pace', [], [...pace]))
      expect(analyze(d, fromPace.totalSec)).toEqual(fromPace)
    }
  })
})

describe('VDOT 與等效成績對照 Daniels 已出版的表格', () => {
  // Daniels' Running Formula VDOT 表：VDOT 40 / 50 的 5K、10K、半馬、全馬
  const TABLE: [number, string[]][] = [
    [40, ['24:08', '50:03', '1:50:59', '3:49:45']],
    [50, ['19:57', '41:21', '1:31:35', '3:10:49']],
  ]
  it.each(TABLE)('VDOT %i 的等效成績與表格差 15 秒內', (vdot, times) => {
    ;[5, 10, HM, MARATHON_KM].forEach((km, i) => expect(Math.abs(raceSec(vdot, km) - hms(times[i]))).toBeLessThan(15))
  })

  it('由比賽成績反推 VDOT', () => {
    expect(vdotOf(10, 3000)).toBeCloseTo(40, 0)
    expect(vdotOf(5, hms('19:57'))).toBeCloseTo(50, 0)
    expect(vdotOf(MARATHON_KM, hms('3:10:49'))).toBeCloseTo(50, 0)
  })

  it('raceSec 是 vdotOf 的反函數', () => {
    for (const v of [22, 35, 50, 70]) for (const km of [1.5, 5, HM, MARATHON_KM]) expect(vdotOf(km, raceSec(v, km))).toBeCloseTo(v, 6)
  })

  it('同配速跑更長距離代表更強，VDOT 更高', () => {
    expect(vdotOf(MARATHON_KM, 300 * MARATHON_KM)).toBeGreaterThan(vdotOf(5, 1500))
  })
})

describe('訓練配速', () => {
  it('VDOT 50 對照 Daniels 表：M 4:31、T 4:15、I 93 秒/400m、R 87 秒/400m 落在區間內', () => {
    const t = trainingPaces(50)
    expect(formatPace(t.M.fast)).toBe(`4'31"`)
    expect(formatPace(t.T.fast)).toBe(`4'15"`)
    expect(t.I.fast).toBeLessThan(232.5)
    expect(t.I.slow).toBeGreaterThan(232.5)
    expect(t.R.fast).toBeLessThan(217.5)
    expect(t.R.slow).toBeGreaterThan(217.5)
  })

  it.each([20, 25, 30, 40, 50, 55])('VDOT %i：由慢到快 E > M > Tempo > T > I > R，且六種配速都不相同', (v) => {
    const t = trainingPaces(v)
    const order = [t.E, t.M, t.Tempo, t.T, t.I, t.R]
    order.forEach((z) => expect(z.fast).toBeLessThanOrEqual(z.slow))
    for (let i = 1; i < order.length; i++) expect(order[i].fast).toBeLessThan(order[i - 1].fast)
    const shown = order.map((z) => `${formatPace(z.fast)}-${formatPace(z.slow)}`)
    expect(new Set(shown).size).toBe(6)
    expect(t.R.slow).toBeLessThan(t.I.fast) // 慢跑者的 R 也不會掉進 I 區
  })
})

describe('模型適用範圍', () => {
  it('1.5 公里以下或超過全馬：只換算配速與時間', () => {
    for (const d of [1, 50]) {
      const r = analyze(d, d * 360)
      expect(r.secPerKm).toBe(360)
      expect(r).toHaveProperty('limit')
      expect(r).not.toHaveProperty('training')
    }
    expect(analyze(MARATHON_KM, 4 * 3600)).toHaveProperty('training')
    expect(analyze(1.5, 6 * 60)).toHaveProperty('training')
  })

  it('接近健走（VDOT < 20）或快過世界紀錄（VDOT > 85）不給 VDOT', () => {
    expect(analyze(MARATHON_KM, 7 * 3600)).toHaveProperty('limit')
    expect(analyze(5, 12 * 60)).toHaveProperty('limit')
  })

  it('VDOT 20–30 照算但標示外推', () => {
    const r = analyze(5, 35 * 60)
    expect(r).toHaveProperty('training')
    expect('note' in r && r.note).toMatch('外推')
    const r40 = analyze(10, 3000)
    expect('note' in r40 && r40.note).toBeFalsy()
  })
})
