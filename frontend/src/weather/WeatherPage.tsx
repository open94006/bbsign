import { useEffect, useRef, useState } from 'react';
import { COUNTIES } from '../data';
import { getAqiBand, getCompassDirection } from '../lib/runnerAdvice';
import { getHeatStressLevel, getRunningCondition, pickBestSlotIndex } from '../lib/runningCondition';
import { adjustWeight, DEFAULT_WEIGHTS, FACTORS, loadWeights, saveWeights, sumWeights, WEIGHT_STEP, WEIGHT_TOTAL, type Weights } from '../lib/runWeights';
import { getSunTimes } from '../lib/sunTimes';
import Page from '../Page';
import './weather.css';

type Slot = {
    time: string;
    temperature: number | null;
    feelsLike: number | null;
    humidity: number | null;
    windSpeed: number | null;
    precipitationProbability: number | null;
    description: string | null;
};

// 對應 backend/weather.py 的 /api/weather；上游缺值時欄位是 null
type Weather = {
    location: string;
    city: string;
    town: string;
    towns: string[];
    station: string;
    lat: number;
    lon: number;
    temperature: number;
    humidity: number;
    windSpeed: number;
    windDeg: number | null;
    description: string | null;
    feelsLike: number | null;
    precipitationProbability: number | null;
    uvIndex: number | null;
    uvLevel: string | null;
    temperatureTrend6h: Slot[];
    airQuality: {
        aqi: number;
        aqiValue: number;
        description: string;
        station: string;
        components: { pm2_5: number | null; pm10: number | null; o3: number | null };
        pollutant?: string | null;
    } | null;
    timestamp: string;
    source: string;
};

type Query = { county: string; town?: string } | { lat: number; lon: number };

const FACTOR_TAG = { thermal: '氣溫', air: '空氣', wind: '風速', rain: '降雨' } as const;
const SAFETY_TEXT = { ok: '', caution: '留意', avoid: '不建議' } as const;

// localStorage 只存個人偏好；私密視窗等情況會丟錯，讀不到就用預設值
const load = (key: string) => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};
const save = (key: string, value: string) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* 存不了就算了 */
    }
};

const clock = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' });
const time = (d: string | Date) => clock.format(new Date(d));
const num = (v: number | null | undefined, unit = '') => (v == null ? '—' : `${Math.round(v * 10) / 10}${unit}`);
// 座標只留小數兩位（約 1 公里）：挑最近測站夠用，伺服器記錄也不會留下精確位置
const round2 = (x: number) => Math.round(x * 100) / 100;

export default function WeatherPage() {
    const [query, setQuery] = useState<Query>(() => {
        const saved = load('bb:wx:county');
        // 鄉鎮由後端驗證，不在白名單會改用縣市政府所在地
        return saved && COUNTIES.includes(saved) ? { county: saved, town: load('bb:wx:town') ?? undefined } : { county: '臺北市' };
    });
    const [data, setData] = useState<Weather | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [locating, setLocating] = useState(false);
    const [weights, setWeights] = useState<Weights>(() => loadWeights());

    // 換地點時先標成載入中（在事件裡設，不在 effect 裡設），effect 只負責抓資料
    const choose = (q: Query) => {
        setLoading(true);
        setError(null);
        setQuery(q);
    };

    useEffect(() => {
        const ctrl = new AbortController();
        const qs = 'county' in query ? new URLSearchParams({ county: query.county, ...(query.town && { town: query.town }) }) : `lat=${query.lat}&lon=${query.lon}`;
        fetch(`/api/weather?${qs}`, { signal: ctrl.signal })
            .then(async (r) => {
                const body = await r.json().catch(() => null);
                // 400、503 的 detail 是後端寫的中文訊息；其他狀態碼（404、422…）一律用通用訊息
                if (!r.ok) throw new Error([400, 503].includes(r.status) && typeof body?.detail === 'string' ? body.detail : '天氣資料暫時無法取得，請稍後再試');
                return body as Weather;
            })
            .then((d) => {
                setData(d);
                save('bb:wx:county', d.city);
                save('bb:wx:town', d.town);
            })
            .catch((e: Error) => !ctrl.signal.aborted && setError(e.message))
            .finally(() => !ctrl.signal.aborted && setLoading(false));
        return () => ctrl.abort();
    }, [query]);

    const locate = () => {
        if (!navigator.geolocation) return setError('這個瀏覽器不支援定位，請改選縣市。');
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (p) => {
                setLocating(false);
                choose({ lat: round2(p.coords.latitude), lon: round2(p.coords.longitude) });
            },
            () => {
                setLocating(false);
                setError('沒有取得定位。請允許這個網站使用位置，或直接選縣市。');
            },
            { timeout: 10000, maximumAge: 600000 },
        );
    };

    const changeWeights = (w: Weights) => {
        setWeights(w);
        saveWeights(w);
    };

    return (
        <Page title="跑步天氣" description="現在適不適合跑步？依所在位置或縣市，看氣溫、濕度、空氣品質、紫外線與未來 6 小時的跑步建議。資料來自中央氣象署與環境部。">
            <div className="wx-controls">
                <label className="sr-only" htmlFor="wx-county">
                    縣市
                </label>
                <select id="wx-county" className="wx-select" value={data?.city ?? ('county' in query ? query.county : '')} onChange={(e) => choose({ county: e.target.value })}>
                    {COUNTIES.map((c) => (
                        <option key={c}>{c}</option>
                    ))}
                </select>
                {data && (
                    <>
                        <label className="sr-only" htmlFor="wx-town">
                            鄉鎮市區
                        </label>
                        <select id="wx-town" className="wx-select" value={data.town} onChange={(e) => choose({ county: data.city, town: e.target.value })}>
                            {data.towns.map((t) => (
                                <option key={t}>{t}</option>
                            ))}
                        </select>
                    </>
                )}
                <button type="button" className="bb-btn" onClick={locate} aria-busy={locating} disabled={locating}>
                    {locating ? '定位中…' : '用我的位置'}
                </button>
                <WeightDialog weights={weights} onChange={changeWeights} />
            </div>

            {error && (
                <p className="wx-notice t-body" role="alert">
                    {error}
                </p>
            )}
            {!data && loading && (
                <p className="t-body wx-muted" aria-live="polite">
                    正在取得天氣…
                </p>
            )}
            {data && <Report d={data} weights={weights} busy={loading} />}
        </Page>
    );
}

// 使用者自己分配 100 點：在彈窗裡改草稿，分配完才能套用；沒套用就關掉等於取消
function WeightDialog({ weights, onChange }: { weights: Weights; onChange: (w: Weights) => void }) {
    const ref = useRef<HTMLDialogElement>(null);
    const [draft, setDraft] = useState(weights);
    const left = WEIGHT_TOTAL - sumWeights(draft);
    const open = () => {
        setDraft(weights);
        ref.current?.showModal();
    };
    const apply = () => {
        onChange(draft);
        ref.current?.close();
    };
    return (
        <>
            <button type="button" className="bb-btn wx-weights-open" aria-haspopup="dialog" onClick={open}>
                評分權重設定
            </button>
            {/* 點背景（dialog 本身，不是內容）就關閉；Esc 由瀏覽器處理 */}
            <dialog ref={ref} className="bb-dialog wx-weights" aria-labelledby="wx-weights-title" onClick={(e) => e.target === e.currentTarget && ref.current?.close()}>
                <div className="bb-dialog__body">
                    <header className="bb-dialog__head">
                        <h2 id="wx-weights-title" className="t-title">
                            評分重點
                        </h2>
                        <button type="button" className="bb-icon-btn bb-icon-btn--s bb-icon-btn--close" aria-label="關閉" onClick={() => ref.current?.close()}>
                            ×
                        </button>
                    </header>
                    <p className="t-caption wx-muted">把 100 點分給四個項目，點數越多，這一項影響分數越大。預設點數是本站的初始設定，不是研究驗證過的比例；安全提示不受點數影響。</p>
                    <ul>
                        {FACTORS.map((f) => {
                            const less = adjustWeight(draft, f.key, -WEIGHT_STEP);
                            const more = adjustWeight(draft, f.key, WEIGHT_STEP);
                            return (
                                <li key={f.key}>
                                    <span>
                                        <span className="t-body">{f.label}</span>
                                        <span className="t-caption wx-muted">{f.hint}</span>
                                    </span>
                                    <button type="button" className="bb-icon-btn bb-icon-btn--s" aria-label={`${f.label}減 ${WEIGHT_STEP} 點`} disabled={!less} onClick={() => less && setDraft(less)}>
                                        −
                                    </button>
                                    <output className="wx-weights__pts" aria-live="polite" aria-label={`${f.label} ${draft[f.key]} 點`}>
                                        {draft[f.key]}
                                    </output>
                                    <button type="button" className="bb-icon-btn bb-icon-btn--s" aria-label={`${f.label}加 ${WEIGHT_STEP} 點`} disabled={!more} onClick={() => more && setDraft(more)}>
                                        +
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    <p className="wx-weights__left t-body" data-done={left === 0 || undefined} role="status">
                        {left === 0 ? '100 點已分配完' : `還有 ${left} 點沒分配`}
                    </p>
                    <footer>
                        <button type="button" className="bb-btn bb-btn--quiet" onClick={() => setDraft({ ...DEFAULT_WEIGHTS })}>
                            恢復預設
                        </button>
                        <button type="button" className="bb-btn bb-btn--primary" disabled={left !== 0} onClick={apply}>
                            套用
                        </button>
                    </footer>
                </div>
            </dialog>
        </>
    );
}

type ReportProps = { d: Weather; weights: Weights; busy: boolean };

function Report({ d, weights, busy }: ReportProps) {
    const air = { pm25: d.airQuality?.components.pm2_5, aqi: d.airQuality?.aqiValue };
    const cond = getRunningCondition({ temperature: d.temperature, humidity: d.humidity, windSpeed: d.windSpeed, precipitationProbability: d.precipitationProbability, ...air, weights });
    const goods = FACTORS.filter((f) => cond.factors[f.key] === 0).map((f) => f.key);
    const avoid = cond.safety.level === 'avoid';

    // 氣溫與濕度是熱環境與熱指數的必要資料，缺一就不評這個時段；空氣品質沒有逐時預報，各時段共用現在的觀測
    const slots = d.temperatureTrend6h.flatMap((s) =>
        s.temperature == null || s.humidity == null
            ? []
            : [
                  {
                      ...s,
                      cond: getRunningCondition({ temperature: s.temperature, humidity: s.humidity, windSpeed: s.windSpeed, precipitationProbability: s.precipitationProbability, ...air, weights }),
                  },
              ],
    );
    const best = pickBestSlotIndex(slots.map((s) => s.cond));

    const heat = getHeatStressLevel(d.temperature, cond.dewPoint);
    const sun = getSunTimes(d.lat, d.lon, new Date(d.timestamp));
    const windDir = d.windDeg == null ? null : getCompassDirection(d.windDeg);

    return (
        <div className="wx-report" aria-busy={busy}>
            <section className="wx-hero" data-level={avoid ? 'poor' : cond.level} aria-label="現在適不適合跑步">
                <p className="t-label wx-muted">
                    {d.location}・{d.station}測站・{time(d.timestamp)} 觀測
                </p>
                <p className="wx-verdict">
                    <span className="wx-verdict__text">{avoid ? '不建議外跑' : cond.text}</span>
                    <span className="wx-verdict__score" title="舒適度分數">
                        {cond.score}
                        <small>/100</small>
                    </span>
                </p>
                <div className="wx-bar" role="img" aria-label={`舒適度 ${cond.score} 分，滿分 100 分`}>
                    <span style={{ width: `${cond.score}%` }} />
                </div>
                {cond.safety.level !== 'ok' && (
                    <p className="wx-notice t-body" role="status">
                        {avoid ? '安全提示：' : '留意：'}
                        {cond.safety.reasons.join('；')}。
                    </p>
                )}
                <ul className="wx-tags t-label">
                    {cond.issues.map((i) => (
                        <li key={i} className="wx-tag wx-tag--warn">
                            {i}
                        </li>
                    ))}
                    {goods.map((k) => (
                        <li key={k} className="wx-tag">
                            {FACTOR_TAG[k]}佳
                        </li>
                    ))}
                    {cond.missing.length > 0 && <li className="wx-tag wx-tag--missing">未計入：{cond.missing.map((k) => FACTOR_TAG[k]).join('、')}（缺資料）</li>}
                </ul>
            </section>

            <dl className="wx-stats">
                <div>
                    <dt className="t-label">氣溫</dt>
                    <dd className="wx-figure">{num(d.temperature, '°')}</dd>
                    <dd className="t-caption wx-muted">
                        體感 {num(d.feelsLike, '°')}・露點 {num(cond.dewPoint, '°')}
                    </dd>
                </div>
                <div>
                    <dt className="t-label">濕度</dt>
                    <dd className="wx-figure">{num(Math.round(d.humidity), '%')}</dd>
                    <dd className="t-caption wx-muted">{d.humidity > 70 ? '偏高，散熱變差' : '舒適'}</dd>
                </div>
                <div>
                    <dt className="t-label">風</dt>
                    <dd className="wx-figure">
                        {d.windSpeed}
                        <small> km/h</small>
                    </dd>
                    <dd className="t-caption wx-muted">{windDir ? `${windDir}風` : '風向未知'}</dd>
                </div>
                <div>
                    <dt className="t-label">降雨機率</dt>
                    <dd className="wx-figure">{num(d.precipitationProbability, '%')}</dd>
                    <dd className="t-caption wx-muted">
                        {d.precipitationProbability == null ? '預報未公布' : d.precipitationProbability >= 60 ? '建議帶雨具' : d.precipitationProbability >= 30 ? '可能有雨' : '不太會下雨'}
                    </dd>
                </div>
                <div>
                    <dt className="t-label">紫外線</dt>
                    <dd className="wx-figure">{num(d.uvIndex)}</dd>
                    <dd className="t-caption wx-muted">{d.uvLevel ?? '夜間無預報'}</dd>
                </div>
                <div>
                    <dt className="t-label">空氣品質 AQI</dt>
                    <dd className="wx-figure">{num(d.airQuality?.aqiValue)}</dd>
                    <dd className="t-caption wx-muted">{d.airQuality ? `${d.airQuality.description}・PM2.5 ${num(d.airQuality.components.pm2_5)}・${d.airQuality.station}站` : '暫無資料'}</dd>
                </div>
            </dl>

            {slots.length > 0 && (
                <section className="wx-section" aria-labelledby="wx-trend">
                    <h2 id="wx-trend" className="t-title">
                        未來 6 小時
                    </h2>
                    <ol className="wx-trend">
                        {slots.map((s, i) => (
                            <li key={s.time} data-level={s.cond.safety.level === 'avoid' ? 'poor' : s.cond.level} data-best={i === best || undefined}>
                                <span className="t-label wx-muted">{time(s.time)}</span>
                                <span className="wx-trend__temp">{num(s.temperature, '°')}</span>
                                <span className="t-caption">{s.description ?? '—'}</span>
                                <span className="wx-bar wx-bar--s" aria-hidden="true">
                                    <span style={{ width: `${s.cond.score}%` }} />
                                </span>
                                <span className="t-caption">
                                    {s.cond.safety.level === 'avoid' ? SAFETY_TEXT.avoid : s.cond.text} {s.cond.score}・降雨 {num(s.precipitationProbability, '%')}
                                </span>
                                {(s.cond.safety.level === 'caution' || s.cond.missing.length > 0) && (
                                    <span className="t-caption wx-muted">
                                        {[s.cond.safety.level === 'caution' && SAFETY_TEXT.caution, s.cond.missing.length > 0 && '資料不完整'].filter(Boolean).join('・')}
                                    </span>
                                )}
                                {i === best && <span className="wx-best t-caption">最適合</span>}
                            </li>
                        ))}
                    </ol>
                </section>
            )}

            <div className="wx-advice">
                {sun.sunrise && sun.sunset && (
                    <section className="wx-section">
                        <h2 className="t-title">日出日落</h2>
                        <SunArc key={d.location} rise={sun.sunrise} set={sun.sunset} hot={heat !== 'none'} />
                    </section>
                )}
                <AirQuality key={d.location} air={d.airQuality} />
            </div>

            <div className="wx-notes">
                <p className="t-caption wx-muted">
                    分數是舒適度，不等於安全。安全提示只涵蓋熱指數（美國國家氣象局分級，假設在陰涼處）、空氣品質與強風；雷雨、豪雨等警特報沒有納入，出門前請看氣象署警特報。
                </p>
                <p className="t-caption wx-muted">
                    資料來源：{d.source}。預報為{d.town}的鄉鎮預報，即時觀測來自最近的{d.station}測站。
                </p>
            </div>
        </div>
    );
}

const hm = (ms: number) => {
    const m = Math.round(ms / 60000);
    return m >= 60 ? `${Math.floor(m / 60)} 小時 ${m % 60} 分` : `${m} 分`;
};
const ARC = 'M20 100 A90 90 0 0 1 200 100'; // 地平線上的半圓，圓心 (110, 100)、半徑 90
// 半徑 45、筆寬 90 的半圓剛好蓋滿整個圓頂；跟著弧線一起畫，就是從日出掃過來的扇形
const SWEEP = 'M65 100 A45 45 0 0 1 155 100';
const RAYS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
const STARS = [
    [52, 62, 0.9],
    [78, 34, 1.2],
    [104, 52, 0.8],
    [132, 26, 1],
    [150, 60, 1.3],
    [176, 44, 0.9],
    [118, 80, 0.7],
];

// 太陽沿弧線從日出點轉到現在的位置，身後掃出一片晨光；入夜換成星空
function SunArc({ rise, set, hot }: { rise: Date; set: Date; hot: boolean }) {
    // 用真正的現在（觀測時間可能晚一小時，會把日落後算成日落前）；掛載時取一次，換地點靠 key 重算
    const [now] = useState(() => new Date());
    const p = Math.min(1, Math.max(0, (+now - +rise) / (+set - +rise)));
    const noon = new Date((+rise + +set) / 2);
    const status = now < rise ? `距日出 ${hm(+rise - +now)}` : now > set ? `已日落・今天日照 ${hm(+set - +rise)}` : `距日落 ${hm(+set - +now)}`;
    return (
        <div className="wx-sun" data-night={p === 0 || p === 1 || undefined}>
            <svg viewBox="0 0 220 118" aria-hidden="true">
                <defs>
                    <linearGradient id="wx-sun-sky" x1="0" y1="1" x2="0" y2="0">
                        <stop offset="0" className="wx-sun__stop-warm" />
                        <stop offset="1" className="wx-sun__stop-clear" />
                    </linearGradient>
                    <linearGradient id="wx-sun-ground" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" className="wx-sun__stop-ground" />
                        <stop offset="1" className="wx-sun__stop-clear" />
                    </linearGradient>
                    <linearGradient id="wx-sun-path" gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="200" y2="0">
                        <stop offset="0" className="wx-sun__stop-dawn" />
                        <stop offset="0.5" className="wx-sun__stop-noon" />
                        <stop offset="1" className="wx-sun__stop-dusk" />
                    </linearGradient>
                    <linearGradient id="wx-sun-horizon" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="220" y2="0">
                        <stop offset="0" className="wx-sun__stop-clear" />
                        <stop offset="0.5" className="wx-sun__stop-line" />
                        <stop offset="1" className="wx-sun__stop-clear" />
                    </linearGradient>
                    <radialGradient id="wx-sun-disc" cx="0.4" cy="0.4">
                        <stop offset="0" className="wx-sun__stop-core" />
                        <stop offset="0.6" className="wx-sun__stop-noon" />
                        <stop offset="1" className="wx-sun__stop-dawn" />
                    </radialGradient>
                    <radialGradient id="wx-sun-halo">
                        <stop offset="0" className="wx-sun__stop-noon" />
                        <stop offset="1" className="wx-sun__stop-clear" />
                    </radialGradient>
                    <filter id="wx-sun-soft" filterUnits="userSpaceOnUse" x="0" y="0" width="220" height="118">
                        <feGaussianBlur stdDeviation="7" />
                    </filter>
                    <mask id="wx-sun-mask">
                        <path className="wx-sun__sweep" filter="url(#wx-sun-soft)" d={SWEEP} pathLength={1} style={{ strokeDashoffset: 1 - p }} />
                    </mask>
                    <clipPath id="wx-sun-clip">
                        <rect x="-20" y="-40" width="260" height="140" />
                    </clipPath>
                </defs>

                <path className="wx-sun__dome" d={`${ARC} Z`} fill="url(#wx-sun-sky)" mask="url(#wx-sun-mask)" />
                <rect className="wx-sun__ground" x="20" y="100" width="180" height="16" fill="url(#wx-sun-ground)" />
                <g className="wx-sun__stars">
                    {STARS.map(([x, y, r], i) => (
                        <circle key={i} cx={x} cy={y} r={r} style={{ animationDelay: `${i * 0.45}s` }} />
                    ))}
                </g>
                <path className="wx-sun__track" d={ARC} />
                <path className="wx-sun__done" d={ARC} pathLength={1} stroke="url(#wx-sun-path)" style={{ strokeDashoffset: 1 - p }} />
                <line className="wx-sun__noon" x1="110" y1="14" x2="110" y2="26" />
                <text className="wx-sun__label" x="110" y="36">
                    正午 {time(noon)}
                </text>
                <line x1="0" y1="100" x2="220" y2="100" stroke="url(#wx-sun-horizon)" />

                {/* 外層裁掉地平線以下：太陽剛升起、剛落下時只露出半顆 */}
                <g clipPath="url(#wx-sun-clip)">
                    <g className="wx-sun__orbit" style={{ transform: `rotate(${p * 180}deg)` }}>
                        <circle className="wx-sun__halo" cx="20" cy="100" r="24" fill="url(#wx-sun-halo)" />
                        <g className="wx-sun__rays">
                            {RAYS.map((a) => (
                                <line key={a} x1={20 + 11 * Math.cos(a)} y1={100 + 11 * Math.sin(a)} x2={20 + 15 * Math.cos(a)} y2={100 + 15 * Math.sin(a)} />
                            ))}
                        </g>
                        <circle className="wx-sun__disc" cx="20" cy="100" r="7.5" fill="url(#wx-sun-disc)" />
                    </g>
                </g>
            </svg>
            <p className="wx-sun__times">
                <span>
                    <span className="t-label wx-muted">日出</span>
                    {time(rise)}
                </span>
                <span className="wx-sun__status t-caption">{status}</span>
                <span>
                    <span className="t-label wx-muted">日落</span>
                    {time(set)}
                </span>
            </p>
            {hot && now < set && <p className="t-body wx-muted">現在偏悶熱，日落後再跑會涼快一些。</p>}
        </div>
    );
}

const AQI_TICKS = [0, 50, 100, 150, 200, 300];

function AirQuality({ air }: { air: Weather['airQuality'] }) {
    if (!air) {
        return (
            <section className="wx-section">
                <h2 className="t-title">空氣品質</h2>
                <p className="t-body wx-muted">附近測站暫無資料。</p>
            </section>
        );
    }
    const band = getAqiBand(air.aqiValue);
    const ozone = band.index >= 2 && air.pollutant?.includes('臭氧');
    return (
        <section className="wx-section wx-air" data-aqi={band.index}>
            <h2 className="t-title">空氣品質</h2>
            <p className="wx-air__head">
                <span className="wx-figure">{num(air.aqiValue)}</span>
                <span className="t-label wx-muted">AQI</span>
                <span className="wx-air__badge t-label">{air.description}</span>
            </p>
            <div className="wx-air__scale" role="img" aria-label={`AQI ${air.aqiValue}，${air.description}`}>
                <span className="wx-air__marker" style={{ left: `${band.position * 100}%` }} />
            </div>
            <ol className="wx-air__ticks t-caption" aria-hidden="true">
                {AQI_TICKS.map((t) => (
                    <li key={t}>{t}</li>
                ))}
            </ol>
            <p className="t-body wx-muted">
                {band.advice}
                {ozone && '臭氧午後最高，改清晨或傍晚跑。'}
            </p>
            <dl className="wx-air__pm">
                {(
                    [
                        ['PM2.5', air.components.pm2_5, 'μg/m³'],
                        ['PM10', air.components.pm10, 'μg/m³'],
                        ['臭氧', air.components.o3, 'ppb'],
                    ] as const
                ).map(([k, v, unit]) => (
                    <div key={k}>
                        <dt className="t-label wx-muted">{k}</dt>
                        <dd className="t-figure">
                            {num(v)}
                            <small> {unit}</small>
                        </dd>
                    </div>
                ))}
            </dl>
            <p className="t-caption wx-muted">
                {air.station}測站{air.pollutant && `・主要污染物：${air.pollutant}`}
            </p>
        </section>
    );
}
