import { useEffect, type ReactNode } from 'react'
import SiteNav from './SiteNav'
import './pages.css'

type Props = { title: string; description: string; children: ReactNode }

// 子頁共用外框：頁首（站名＋全站導覽）、標題、頁尾。title、description、canonical 跟著頁面換（首頁的值寫在 index.html）
export default function Page({ title, description, children }: Props) {
  useEffect(() => {
    document.title = `${title}｜BB Sign 比比賽`
    document.querySelector('meta[name="description"]')?.setAttribute('content', description)
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', `https://bbsign.dev${location.pathname}`)
  }, [title, description])

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
        <SiteNav />
      </header>
      <main className="page-main">
        <h1 className="t-headline">{title}</h1>
        {children}
      </main>
      <footer className="page-foot t-caption">© {new Date().getFullYear()} BB Sign 比比賽・國內賽事報名資訊平台</footer>
    </div>
  )
}
