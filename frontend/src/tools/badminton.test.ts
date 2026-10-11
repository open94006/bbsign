import { describe, expect, it } from 'vitest'
import { START, gameWinner, matchWinner, point, serveSide, type Match, type Team } from './badminton'

const play = (m: Match, rallies: string) => [...rallies].reduce((acc, t) => point(acc, t as Team), m)

describe('gameWinner', () => {
  it('21 分且領先 2 分才贏', () => {
    expect(gameWinner({ A: 21, B: 19 })).toBe('A')
    expect(gameWinner({ A: 21, B: 20 })).toBeNull()
    expect(gameWinner({ A: 22, B: 20 })).toBe('A')
    expect(gameWinner({ A: 28, B: 29 })).toBeNull()
  })
  it('30 分封頂', () => {
    expect(gameWinner({ A: 29, B: 30 })).toBe('B')
  })
})

describe('point', () => {
  it('發球方得分：雙打兩人換位，繼續發球', () => {
    const m = point(START, 'A')
    expect(m.serving).toBe('A')
    expect(m.courts.A).toEqual(['A2', 'A1'])
    expect(m.courts.B).toEqual(['B1', 'B2'])
  })
  it('接發球方得分：換發球，站位不動', () => {
    const m = point(START, 'B')
    expect(m.serving).toBe('B')
    expect(m.courts).toEqual(START.courts)
  })
  it('單打不換位', () => {
    expect(point({ ...START, doubles: false }, 'A').courts).toEqual(START.courts)
  })
  it('偶數分站右區、奇數分站左區', () => {
    const m = play(START, 'BB') // B 2 分在發球
    expect(serveSide(m)).toBe(0)
    expect(serveSide(point(m, 'B'))).toBe(1)
  })
  it('贏下一局就加局數，兩局獲勝', () => {
    const game = play(START, 'A'.repeat(21))
    expect(game.score).toEqual({ A: 21, B: 0 })
    expect(game.sets).toEqual({ A: 1, B: 0 })
    expect(matchWinner(game)).toBeNull()
    const second = play({ ...game, score: { A: 0, B: 0 } }, 'A'.repeat(21))
    expect(matchWinner(second)).toBe('A')
  })
  it('不修改原本的狀態（上一步要用）', () => {
    const before = JSON.stringify(START)
    play(START, 'ABAB')
    expect(JSON.stringify(START)).toBe(before)
  })
})
