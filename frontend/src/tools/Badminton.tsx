import { useEffect, useRef, useState } from 'react'
import Page from '../Page'
import { START, gameWinner, matchWinner, point, serveSide, type Match, type Team } from './badminton'
import './tools.css'

const NAME: Record<Team, string> = { A: '紅方', B: '藍方' }
const SIDE = ['右', '左']
const KEY = 'bb:badminton'
const TTL = 3 * 60 * 60 * 1000 // 超過 3 小時沒動就當新比賽
const HISTORY = 300 // 上一步最多記這麼多球

type Game = { m: Match; history: Match[] }

// 重新整理不遺失比分；存不了（私密視窗等）就只是不能續局
function load(): Game {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (s && Date.now() - s.at < TTL && typeof s.m?.score?.A === 'number') return { m: s.m, history: s.history ?? [] }
  } catch {
    /* 讀不到就從頭開始 */
  }
  return { m: START, history: [] }
}

// 比賽中螢幕不休眠；不支援的瀏覽器就略過。切到背景會被系統釋放，回來再要一次
function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | undefined
    const request = () => {
      if (document.visibilityState === 'visible') navigator.wakeLock.request('screen').then((l) => (lock = l), () => {})
    }
    request()
    document.addEventListener('visibilitychange', request)
    return () => {
      document.removeEventListener('visibilitychange', request)
      lock?.release()
    }
  }, [])
}

export default function Badminton() {
  const [{ m, history }, setGame] = useState(load)
  const [editing, setEditing] = useState<{ t: Team; i: 0 | 1 } | null>(null)
  const rules = useRef<HTMLDialogElement>(null)
  useWakeLock()

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ m, history, at: Date.now() }))
    } catch {
      /* 存不了就算了 */
    }
  }, [m, history])

  const won = gameWinner(m.score)
  const champion = matchWinner(m)
  const side = serveSide(m)
  const server = m.doubles ? m.courts[m.serving][side] : NAME[m.serving]
  const started = history.length > 0

  const commit = (next: Match, keepHistory = true) => setGame((g) => ({ m: next, history: keepHistory ? [...g.history, g.m].slice(-HISTORY) : [] }))
  const undo = () => setGame((g) => (g.history.length ? { m: g.history[g.history.length - 1], history: g.history.slice(0, -1) } : g))
  // 新的一局：比分歸零，上一局的贏家發球（serving 本來就是他），站位與名字保留
  const nextGame = () => commit({ ...m, score: { A: 0, B: 0 } })
  const newMatch = (doubles = m.doubles) => commit({ ...START, doubles, courts: m.courts }, false)
  const confirmNew = (doubles = m.doubles) => (!started || confirm('目前的比分會清除，確定嗎？')) && newMatch(doubles)

  const rename = (t: Team, i: 0 | 1, value: string) => {
    const name = value.trim()
    if (name) setGame((g) => ({ ...g, m: { ...g.m, courts: { ...g.m.courts, [t]: g.m.courts[t].map((n, j) => (j === i ? name : n)) } } }))
    setEditing(null)
  }

  return (
    <Page title="羽球記分板" description="免費的羽球線上記分板：單打、雙打記分，手機直放橫放都能用，重新整理也不會遺失比分。">
      <div className="bm">
        <div className="bm-bar">
          <div className="tl-row" role="group" aria-label="單打或雙打">
            <button type="button" className="bb-chip" aria-pressed={m.doubles} onClick={() => !m.doubles && confirmNew(true)}>
              雙打
            </button>
            <button type="button" className="bb-chip" aria-pressed={!m.doubles} onClick={() => m.doubles && confirmNew(false)}>
              單打
            </button>
          </div>
          <p className="bm-sets t-label">
            局數 <b data-team="A">{m.sets.A}</b> : <b data-team="B">{m.sets.B}</b>
          </p>
          <div className="tl-row">
            <button type="button" className="bb-chip" onClick={undo} disabled={!started}>
              上一步
            </button>
            <button type="button" className="bb-chip" onClick={() => confirmNew()} disabled={!started}>
              重新開始
            </button>
          </div>
        </div>

        {won ? (
          <div className="bm-result" role="status">
            <p className="t-title">
              {champion ? `${NAME[champion]}獲勝！局數 ${m.sets.A} : ${m.sets.B}` : `${NAME[won]}贏得這一局（${m.score.A} : ${m.score.B}）`}
            </p>
            <div className="tl-row">
              <button type="button" className="bb-btn bb-btn--primary" onClick={() => (champion ? newMatch() : nextGame())}>
                {champion ? '開始新比賽' : '下一局'}
              </button>
              <button type="button" className="bb-btn" onClick={undo}>
                記錯了，上一步
              </button>
            </div>
          </div>
        ) : (
          <p className="bm-status t-title" aria-live="polite">
            發球：{server}（{SIDE[side]}區）
          </p>
        )}

        <div className="bm-courts">
          {(['A', 'B'] as const).map((t) => (
            <section key={t} className="bm-team" data-team={t} data-serving={m.serving === t || undefined} aria-label={NAME[t]}>
              <h2 className="bm-team__name t-title">
                {NAME[t]}
                {m.serving === t && !won && <span className="bm-badge t-caption">發球</span>}
              </h2>
              <button type="button" className="bm-score" onClick={() => commit(point(m, t))} disabled={!!won} aria-label={`${NAME[t]}得分（目前 ${m.score[t]} 分）`}>
                {m.score[t]}
              </button>
              {m.doubles && (
                <div className="bm-players">
                  {([1, 0] as const).map((i) =>
                    editing?.t === t && editing.i === i ? (
                      <input
                        key={i}
                        className="bm-player"
                        defaultValue={m.courts[t][i]}
                        aria-label={`${NAME[t]}${SIDE[i]}區球員名字`}
                        maxLength={12}
                        autoFocus
                        onBlur={(e) => rename(t, i, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur()
                          if (e.key === 'Escape') setEditing(null)
                        }}
                      />
                    ) : (
                      <button
                        key={i}
                        type="button"
                        className="bm-player"
                        data-serving={(m.serving === t && side === i && !won) || undefined}
                        onClick={() => setEditing({ t, i })}
                        aria-label={`${SIDE[i]}區：${m.courts[t][i]}，點一下改名字`}
                      >
                        <span className="t-caption">{SIDE[i]}區</span>
                        {m.courts[t][i]}
                      </button>
                    ),
                  )}
                </div>
              )}
            </section>
          ))}
        </div>

        <p className="t-caption tl-muted">點比分加一分。比分存在這台裝置上，重新整理也不會遺失；比賽中螢幕不會自動關閉。</p>

        <button type="button" className="bb-btn bm-rules-open" aria-haspopup="dialog" onClick={() => rules.current?.showModal()}>
          規則快速查閱
        </button>
        {/* 點背景（dialog 本身，不是內容）就關閉；Esc 由瀏覽器處理 */}
        <dialog ref={rules} className="bb-dialog bm-rules" aria-labelledby="bm-rules-title" onClick={(e) => e.target === e.currentTarget && rules.current?.close()}>
          <div className="bb-dialog__body">
            <header className="bb-dialog__head">
              <h2 id="bm-rules-title" className="t-title">
                規則快速查閱
              </h2>
              <button type="button" className="bb-icon-btn bb-icon-btn--s bb-icon-btn--close" aria-label="關閉" onClick={() => rules.current?.close()}>
                ×
              </button>
            </header>
            <ul className="t-body">
              <li>三局兩勝，每球得分制，先拿 21 分且領先 2 分贏一局；29 平時先拿到 30 分的贏。</li>
              <li>發球方分數偶數站右區、奇數站左區（右偶左奇）。</li>
              <li>雙打一隊一次發球權：發球方得分就換位繼續發，失分就換對方發球。</li>
              <li>發球瞬間擊球點要低於腰（最低一根肋骨），拍桿朝下，動作連續不可停頓，雙腳不可離地或踩線。</li>
              <li>比賽中球拍、身體不可觸網，也不可在球過網前把拍子伸過網擊球。</li>
              <li>單打場地走內側長、外側窄；雙打走外側寬、發球區較短。</li>
            </ul>
          </div>
        </dialog>
      </div>
    </Page>
  )
}
