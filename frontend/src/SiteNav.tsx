const NAV = [
  ['/', '找賽事'],
  ['/weather', '跑步天氣'],
  ['/pace', '配速'],
  ['/tools', '小工具'],
] as const

// 全站右上角導覽：首頁（找賽事）與各子頁共用，樣式在 index.css
export default function SiteNav() {
  const here = location.pathname.replace(/\/+$/, '') || '/'
  return (
    <nav className="site-nav" aria-label="主選單">
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
  )
}
