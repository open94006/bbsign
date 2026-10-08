import { geoArea, geoMercator, geoPath } from 'd3-geo'
import type { Feature, FeatureCollection, Geometry, MultiPolygon } from 'geojson'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import topo from 'taiwan-atlas/counties-10t.json'

type County = Feature<Geometry, { COUNTYNAME: string }>
const W = 400
const H = 560
// 離島各自放進左上角的插圖框，本島才能放大
const INSETS: Record<string, [[number, number], [number, number]]> = {
  連江縣: [[18, 30], [76, 66]],
  金門縣: [[18, 104], [76, 140]],
  澎湖縣: [[18, 178], [76, 214]],
}

const all = (
  feature(topo as unknown as Topology, (topo as unknown as Topology).objects.counties as GeometryCollection) as FeatureCollection<
    Geometry,
    { COUNTYNAME: string }
  >
).features.map((f) => ({ ...f, properties: { COUNTYNAME: f.properties.COUNTYNAME.replace('台', '臺') } }))

const mainland: FeatureCollection<Geometry> = { type: 'FeatureCollection', features: all.filter((f) => !INSETS[f.properties.COUNTYNAME]) }
const mainPath = geoPath(geoMercator().fitExtent([[124, 16], [W - 12, H - 12]], mainland))

// 插圖只畫主要島嶼：烏坵、七美這類遠離主島的小島會把範圍拉大，讓主島小到看不見
function majorIslands(f: County): County {
  if (f.geometry.type !== 'MultiPolygon') return f
  const polys = f.geometry.coordinates
  const areas = polys.map((p) => geoArea({ type: 'Polygon', coordinates: p }))
  const max = Math.max(...areas)
  const geometry: MultiPolygon = { type: 'MultiPolygon', coordinates: polys.filter((_, i) => areas[i] >= max * 0.1) }
  return { ...f, geometry }
}

// 地圖不會變，路徑先算好
const SHAPES = all.map((f: County) => {
  const name = f.properties.COUNTYNAME
  const box = INSETS[name]
  if (!box) return { name, d: mainPath(f) ?? '', box }
  const islands = majorIslands(f)
  return { name, d: geoPath(geoMercator().fitExtent(box, islands))(islands) ?? '', box }
})

const level = (n: number) => (n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 10 ? 3 : 4)

type Props = { counts: Record<string, number>; selected: string | null; onSelect: (county: string) => void }

// 設計規範 MapCounty：亮度代表賽事數，游標停留時縣市浮起，提示跟著游標
export default function TaiwanMap({ counts, selected, onSelect }: Props) {
  const [hover, setHover] = useState<string | null>(null)

  const [touch, setTouch] = useState(false)
  const tip = useRef<HTMLDivElement>(null)

  // 用整張地圖的指標事件判斷游標下是哪個縣市：縣市本身會被重新排序（浮起），
  // 逐一監聽縣市的進出會漏掉「離開」，提示就會卡在畫面上
  const track = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') {
      // 觸控：手指滑到哪個縣市就顯示哪個（觸控會鎖定在按下的元素，所以用座標找），
      // 滑出地圖時保留最後一個，小縣市才點得到
      setTouch(true)
      const name = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-county]')?.getAttribute('data-county') ?? null
      if (name || e.type === 'pointerdown') setHover(name)
      return
    }
    setTouch(false)
    if (tip.current) tip.current.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 16}px)`
    setHover((e.target as Element).closest('[data-county]')?.getAttribute('data-county') ?? null)
  }
  const onKey = (e: KeyboardEvent, name: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(name)
    }
  }
  // 停留與選中的縣市最後畫，浮起時才不會被隔壁縣市蓋住
  const raised = (name: string) => Number(name === selected || name === hover)
  const order = [...SHAPES].sort((a, b) => raised(a.name) - raised(b.name))

  return (
    <>
      <svg className="map" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="台灣縣市地圖，點選縣市查看賽事" onPointerDown={track} onPointerMove={track} onPointerOver={track} onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}>
        {order.map(({ name, d, box }) => {
          const n = counts[name] ?? 0
          const props = {
            className: 'bb-county',
            'data-level': level(n),
            role: 'button',
            tabIndex: 0,
            'aria-pressed': selected === name,
            'aria-label': `${name}，${n} 場賽事`,
            'data-county': name,
            'data-hover': touch && hover === name,
            onClick: () => {
              if (touch) return // 觸控要按提示上的「詳細」才開選單
              setHover(null) // 點下去地圖會移動，提示不該留在原地
              onSelect(name)
            },
            onKeyDown: (e: KeyboardEvent) => onKey(e, name),
          }
          if (!box) return <path key={name} d={d} {...props} />
          const [[x0, y0], [x1, y1]] = box
          return (
            <g key={name} {...props} className="bb-county map-inset">
              <rect x={x0 - 8} y={y0 - 8} width={x1 - x0 + 16} height={y1 - y0 + 16} rx="8" />
              <path d={d} />
              <text x={x0 - 8} y={y0 - 14}>
                {name}
              </text>
            </g>
          )
        })}
      </svg>
      {touch ? (
        <div className="bb-tip bb-tip--touch" hidden={!hover}>
          <span className="t-label">{hover}</span>
          <button
            type="button"
            className="bb-btn"
            onClick={() => {
              if (hover) onSelect(hover)
              setHover(null)
            }}
          >
            詳細
          </button>
          <span className="t-figure">{hover ? (counts[hover] ?? 0) : 0} 場</span>
        </div>
      ) : (
        <div ref={tip} className="bb-tip" hidden={!hover} aria-hidden="true">
          <span className="t-label">{hover}</span>
          <span className="t-figure">{hover ? (counts[hover] ?? 0) : 0} 場</span>
        </div>
      )}
    </>
  )
}
