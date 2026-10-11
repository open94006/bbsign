// 羽球計分規則（純函式，畫面在 Badminton.tsx）：每球得分、21 分且領先 2 分贏一局、最多 30 分、三局兩勝

export type Team = 'A' | 'B'
export type Match = {
  score: Record<Team, number>
  sets: Record<Team, number>
  serving: Team
  doubles: boolean
  courts: Record<Team, [string, string]> // 雙打站位 [右區, 左區]
}

export const START: Match = {
  score: { A: 0, B: 0 },
  sets: { A: 0, B: 0 },
  serving: 'A',
  doubles: true,
  courts: { A: ['A1', 'A2'], B: ['B1', 'B2'] },
}

export function gameWinner({ A, B }: Record<Team, number>): Team | null {
  if (A >= 30 || (A >= 21 && A - B >= 2)) return 'A'
  if (B >= 30 || (B >= 21 && B - A >= 2)) return 'B'
  return null
}

export const matchWinner = (m: Match): Team | null => (m.sets.A >= 2 ? 'A' : m.sets.B >= 2 ? 'B' : null)

// 誰贏這一球：發球方得分 → 雙打的發球方兩人換位；接發球方得分 → 換他們發球，站位不動
export function point(m: Match, t: Team): Match {
  const next: Match = { ...m, score: { ...m.score, [t]: m.score[t] + 1 }, sets: { ...m.sets }, courts: { ...m.courts }, serving: t }
  if (m.serving === t && m.doubles) next.courts[t] = [m.courts[t][1], m.courts[t][0]]
  if (gameWinner(next.score) === t) next.sets[t] += 1
  return next
}

// 發球方分數偶數站右區、奇數站左區
export const serveSide = (m: Match): 0 | 1 => (m.score[m.serving] % 2 === 0 ? 0 : 1)
