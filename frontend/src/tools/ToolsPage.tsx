import Page from '../Page'

const TOOLS = [
  ['/tools/badminton', '羽球記分板', '單打、雙打記分，手機直放橫放都能用，重新整理也不會遺失比分。'],
  ['/tools/convert', '球速、重量換算', '球速 mph ↔ km/h、重量 kg ↔ lb 即時互換。'],
] as const

export default function ToolsPage() {
  return (
    <Page title="小工具" description="BB Sign 比比賽的免費運動小工具：羽球記分板、球速與重量換算。">
      <ul className="tool-list">
        {TOOLS.map(([href, name, desc]) => (
          <li key={href}>
            <a href={href}>
              <span className="t-title">{name}</span>
              <p className="t-body">{desc}</p>
            </a>
          </li>
        ))}
      </ul>
    </Page>
  )
}
