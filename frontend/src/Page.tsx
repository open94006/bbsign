import { useEffect, type ReactNode } from 'react'
import './pages.css'

const NAV = [
  ['/', '找賽事'],
  ['/weather', '跑步天氣'],
  ['/pace', '配速'],
  ['/tools', '小工具'],
] as const

type Props = { title: string; description: string; children: ReactNode }

// 子頁共用外框：頁首導覽、標題、頁尾。title、description、canonical 跟著頁面換（首頁的值寫在 index.html）
export default function Page({ title, description, children }: Props) {
  useEffect(() => {
    document.title = `${title}｜BB Sign 比比賽`
    document.querySelector('meta[name="description"]')?.setAttribute('content', description)
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', `https://bbsign.dev${location.pathname}`)
  }, [title, description])

  const here = location.pathname.replace(/\/+$/, '')
  return (
    <div className="page">
      <div className="bb-sky" aria-hidden="true">
        <span className="bb-sky__stars" />
        <span className="bb-sky__sun" />
      </div>
      <header className="page-bar">
        <a href="/" className="t-wordmark">
          BB SIGN
        </a>
        <nav aria-label="主選單">
          <ul>
            {NAV.map(([href, label]) => (
              <li key={href}>
                <a href={href} className="t-label" aria-current={here === href || (href !== '/' && here.startsWith(`${href}/`)) ? 'page' : undefined}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="page-main">
        <h1 className="t-headline">{title}</h1>
        {children}
      </main>
      <footer className="page-foot t-caption">BB Sign 比比賽・國內賽事報名資訊平台</footer>
    </div>
  )
}
