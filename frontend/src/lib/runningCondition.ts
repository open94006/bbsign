import { DEFAULT_WEIGHTS, type FactorKey, type Weights } from './runWeights';

// 露點溫度（Magnus 公式），用來衡量體感濕熱程度——比單純濕度更準確，
// 因為同樣 70% 濕度，30°C 比 15°C 悶熱得多，露點會反映這個差異。
export const calculateDewPoint = (tempC: number, humidityPercent: number): number => {
    const a = 17.27;
    const b = 237.7;
    const rh = Math.min(100, Math.max(1, humidityPercent)); // 避免 ln(0) 或負值濕度造成 NaN
    const alpha = (a * tempC) / (b + tempC) + Math.log(rh / 100);
    return (b * alpha) / (a - alpha);
};

export type HeatStressLevel = 'none' | 'slight' | 'moderate' | 'severe';

// 悶熱分級：跑圈常用「溫度+露點總和」法則（Runner's World 等廣泛引用），供補水量與日落後跑建議使用。
// 只用於文字建議，不進舒適度分數，也不是安全門檻（安全看下方 getRunSafety）。
export const getHeatStressLevel = (tempC: number, dewPointC: number): HeatStressLevel => {
    const sum = tempC + dewPointC;
    if (sum <= 37) return 'none';
    if (sum <= 43) return 'slight';
    if (sum <= 49) return 'moderate';
    return 'severe';
};

// 將秒/公里格式化為跑者慣用的 6'15" 格式
export const formatPace = (secPerKm: number): string => {
    const totalSeconds = Math.round(secPerKm);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}'${seconds.toString().padStart(2, '0')}"`;
};

// PM2.5 官方對照表（EPA / 台灣 moenv 標準），供 UI 門檻與評分共用同一份數字來源
export const PM25_BREAKPOINTS = {
    good: 12, // ≤12.0 良好（AQI 0-50）
    moderate: 35.4, // ≤35.4 普通（AQI 51-100）
    sensitiveUnhealthy: 55.4, // ≤55.4 對敏感族群不健康（AQI 101-150）
    unhealthy: 150.4, // ≤150.4 對所有族群不健康（AQI 151-200）
    veryUnhealthy: 250.4, // ≤250.4 非常不健康（AQI 201-300）
} as const;

// ---------- 各因素的不利程度：0 = 沒有不利影響，100 = 本模型定義的最不利 ----------
// 錨點沿用舊版分段表「各級距上緣的扣分」，級距之間改成線性內插：
// 保留原本的量級，同時消掉跨一度就跳 4–6 分的斷崖（例如 18°C → 19°C）。錨點範圍外取端點值。
type Curve = readonly (readonly [number, number])[];
const interpolate = (curve: Curve, x: number): number => {
    if (x <= curve[0][0]) return curve[0][1];
    for (let i = 1; i < curve.length; i += 1) {
        const [x1, y1] = curve[i];
        if (x <= x1) {
            const [x0, y0] = curve[i - 1];
            return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
        }
    }
    return curve[curve.length - 1][1];
};
const toPercent = (points: number, max: number) => Math.min(100, (points / max) * 100);

// 舊版點數：冷側最多 30、熱側氣溫最多 30、露點最多 20。12–18°C 為最佳區間。
const COLD_CURVE: Curve = [[1, 30], [3, 26], [5, 20], [7, 14], [9, 8], [11, 4], [12, 0]];
const HEAT_CURVE: Curve = [[18, 0], [21, 4], [24, 8], [27, 14], [30, 20], [33, 26], [36, 30]];
const DEW_POINT_CURVE: Curve = [[10, 0], [15, 3], [20, 5], [24, 12], [28, 20]];
const THERMAL_MAX = 50; // 熱側氣溫 30 + 露點 20：舊版最熱最悶時的扣分，定為 100

// 熱環境＝氣溫＋露點。舊版另有「濕度 > 70% / 80%」扣分，但露點已涵蓋濕度造成的悶熱，
// 而且 15°C、85% 這種涼爽潮濕的天氣並不難跑，所以拿掉濕度這一項，避免同一份濕熱資訊算兩次。
export const getThermalPenalty = (tempC: number, dewPointC: number): number =>
    toPercent(interpolate(COLD_CURVE, tempC) + interpolate(HEAT_CURVE, tempC) + interpolate(DEW_POINT_CURVE, dewPointC), THERMAL_MAX);

// 空氣品質：PM2.5 與 AQI 是同一項因素的兩個來源，取較差的（不相加）。
// AQI 已含 PM2.5 子指標，但它用移動平均、也會被臭氧拉高；PM2.5 是逐時濃度，反應較快。
// 舊版扣分 0/15/30/50/65/80 對應六級，最差一級（80）定為 100。最後一級的上緣用 EPA 的下一個切點（350.4 / AQI 400）。
const AIR_POINTS = [0, 15, 30, 50, 65, 80];
const PM25_EDGES = [PM25_BREAKPOINTS.good, PM25_BREAKPOINTS.moderate, PM25_BREAKPOINTS.sensitiveUnhealthy, PM25_BREAKPOINTS.unhealthy, PM25_BREAKPOINTS.veryUnhealthy, 350.4];
const AQI_EDGES = [50, 100, 150, 200, 300, 400];
const PM25_CURVE: Curve = PM25_EDGES.map((x, i) => [x, AIR_POINTS[i]]);
const AQI_CURVE: Curve = AQI_EDGES.map((x, i) => [x, AIR_POINTS[i]]);

const isNum = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

export const getAirPenalty = (pm25: number | null | undefined, aqi: number | null | undefined): number | null => {
    const values = [isNum(pm25) ? interpolate(PM25_CURVE, pm25) : null, isNum(aqi) ? interpolate(AQI_CURVE, aqi) : null].filter(isNum);
    return values.length ? toPercent(Math.max(...values), 80) : null;
};

// 空氣分數上限：加權扣分最多只扣權重那幾點（預設 25），空氣再差分數也還有 75，所以另外壓一個上限。
// 錨點同樣是各級上緣：普通 → 70、對敏感族群不健康 → 55（這一級大約 55–70，接近 60）、對所有族群不健康 → 40、非常不健康 → 20、危害 → 0。
const AIR_CAPS = [100, 70, 55, 40, 20, 0];
const PM25_CAP_CURVE: Curve = PM25_EDGES.map((x, i) => [x, AIR_CAPS[i]]);
const AQI_CAP_CURVE: Curve = AQI_EDGES.map((x, i) => [x, AIR_CAPS[i]]);

// 空氣權重低於預設時，上限按比例放寬（權重 0 就沒有上限）；預設以上維持原上限，更重的部分交給加權扣分。
export const getAirScoreCap = (pm25: number | null | undefined, aqi: number | null | undefined, airWeight: number): number => {
    const caps = [isNum(pm25) ? interpolate(PM25_CAP_CURVE, pm25) : null, isNum(aqi) ? interpolate(AQI_CAP_CURVE, aqi) : null].filter(isNum);
    if (!caps.length) return 100;
    return 100 - (100 - Math.min(...caps)) * Math.min(1, airWeight / DEFAULT_WEIGHTS.air);
};

// 空氣品質六級（0 良好 … 5 危害），PM2.5 與 AQI 取較差的一級；給文字標籤與安全判斷用
const getAirBand = (pm25: number | null | undefined, aqi: number | null | undefined): number | null => {
    const band = (edges: number[], x: number) => edges.slice(0, 5).filter((e) => x > e).length;
    const bands = [isNum(pm25) ? band(PM25_EDGES, pm25) : null, isNum(aqi) ? band(AQI_EDGES, aqi) : null].filter(isNum);
    return bands.length ? Math.max(...bands) : null;
};

// 風速（km/h，後端已由 m/s 換算）。舊版 > 20 扣 8、> 30 扣 15
const WIND_CURVE: Curve = [[20, 0], [30, 8], [40, 15]];
export const getWindPenalty = (kmh: number): number => toPercent(interpolate(WIND_CURVE, kmh), 15);

// 降雨機率（%）直接當不利程度：氣象署只給機率不給雨量，這裡衡量的是「被淋到的機會」，不是雨多大
export const getRainPenalty = (probability: number): number => Math.min(100, Math.max(0, probability));

// ---------- 安全：和舒適度分數分開，權重點數不影響 ----------
export type SafetyLevel = 'ok' | 'caution' | 'avoid';
export type RunSafety = { level: SafetyLevel; reasons: string[] };

// 美國國家氣象局（NWS）熱指數：Rothfusz 迴歸＋官方修正，以 °F 計算。
// 假設在陰涼處、微風；太陽直曬時 NWS 說體感可再高約 15°F（8°C），所以這是偏寬鬆的估計。
export const calculateHeatIndex = (tempC: number, humidityPercent: number): number => {
    const t = (tempC * 9) / 5 + 32;
    const rh = humidityPercent;
    let hi = 0.5 * (t + 61 + (t - 68) * 1.2 + rh * 0.094);
    if ((hi + t) / 2 >= 80) {
        hi =
            -42.379 + 2.04901523 * t + 10.14333127 * rh - 0.22475541 * t * rh - 0.00683783 * t * t -
            0.05481717 * rh * rh + 0.00122874 * t * t * rh + 0.00085282 * t * rh * rh - 0.00000199 * t * t * rh * rh;
        if (rh < 13 && t >= 80 && t <= 112) hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
        else if (rh > 85 && t >= 80 && t <= 87) hi += ((rh - 85) / 10) * ((87 - t) / 5);
    }
    return ((hi - 32) * 5) / 9;
};

// 門檻全部來自官方分級，沒有自訂：
// - 熱指數：NWS「極度注意」≥ 90°F（32.2°C）、「危險」≥ 103°F（39.4°C），兩級都明列體力活動會引發熱傷害
// - 空氣：環境部 AQI，101–150 敏感族群不健康、> 150 對所有族群不健康（PM2.5 同級距）
// - 風：氣象署陸上強風特報標準，平均風力 6 級（10.8 m/s ≈ 39 km/h）
// 沒有資料的風險（雷雨、豪雨等警特報、陣風）不在這裡，畫面上要另外說明。
export const getRunSafety = ({ temperature, humidity, windSpeed, pm25, aqi }: Pick<RunningInput, 'temperature' | 'humidity' | 'windSpeed' | 'pm25' | 'aqi'>): RunSafety => {
    const avoid: string[] = [];
    const caution: string[] = [];
    const hi = calculateHeatIndex(temperature, humidity);
    if (hi >= 39.4) avoid.push(`熱指數 ${Math.round(hi)}°C，達熱傷害「危險」等級`);
    else if (hi >= 32.2) caution.push(`熱指數 ${Math.round(hi)}°C，長時間跑步可能熱傷害`);
    const air = getAirBand(pm25, aqi);
    if (air != null && air >= 3) avoid.push('空氣品質對所有族群不健康');
    else if (air === 2) caution.push('空氣品質對敏感族群不健康');
    if (isNum(windSpeed) && windSpeed >= 39) caution.push('風速達強風特報標準');
    return { level: avoid.length ? 'avoid' : caution.length ? 'caution' : 'ok', reasons: [...avoid, ...caution] };
};

// ---------- 加權總分 ----------
export type RunningInput = {
    temperature: number; // °C
    humidity: number; // %，和氣溫一起算露點與熱指數，缺一不評分
    windSpeed?: number | null; // km/h
    pm25?: number | null; // μg/m³
    aqi?: number | null; // 環境部 AQI 數值（0–500），不是 1–5 級
    precipitationProbability?: number | null; // %
    weights?: Weights;
};

const COLD_ISSUES: [number, string][] = [[1, '氣溫極端偏低'], [3, '氣溫過低'], [5, '氣溫偏低'], [7, '氣溫微偏低'], [9, '氣溫稍低']];
const HEAT_ISSUES: [number, string][] = [[33, '氣溫極端偏高'], [30, '氣溫過高'], [27, '氣溫偏高'], [24, '氣溫微偏高'], [21, '氣溫稍高']];
const DEW_POINT_ISSUES: [number, string][] = [[24, '極度悶熱'], [20, '悶熱難耐'], [15, '悶熱感明顯']];
const AIR_ISSUES = ['', '', '空氣對敏感族群不友善', '空氣品質不佳', '空氣品質很差', '空氣品質危害健康'];

// 分數 S = 100 − Σ(Wᵢ × Pᵢ) / ΣWᵢ，Pᵢ 是各因素 0–100 的不利程度，Wᵢ 是權重點數。
// 資料齊全時 ΣWᵢ = 100，就是 100 − Σ(Wᵢ × Pᵢ) / 100。
// 缺資料的因素不當成理想天氣（不算 0），而是從分母拿掉、用其餘因素的權重重新正規化，並列在 missing；
// 這樣的分數和資料齊全的分數不完全可比，所以挑最佳時段時資料齊全者優先（見 pickBestSlotIndex）。
// 算完再和空氣上限取較低的（getAirScoreCap），被上限壓住時 deductions 加總不等於 100 − score。
export const getRunningCondition = ({ temperature, humidity, windSpeed, pm25, aqi, precipitationProbability, weights = DEFAULT_WEIGHTS }: RunningInput) => {
    const dewPoint = calculateDewPoint(temperature, humidity);
    const factors: Record<FactorKey, number | null> = {
        thermal: getThermalPenalty(temperature, dewPoint),
        air: getAirPenalty(pm25, aqi),
        wind: isNum(windSpeed) ? getWindPenalty(windSpeed) : null,
        rain: isNum(precipitationProbability) ? getRainPenalty(precipitationProbability) : null,
    };
    const keys = Object.keys(factors) as FactorKey[];
    const missing = keys.filter((k) => factors[k] == null);
    const usedWeight = keys.reduce((sum, k) => sum + (factors[k] == null ? 0 : weights[k]), 0); // 熱環境最少 10 點，不會是 0
    const deductions = Object.fromEntries(keys.map((k) => [k, ((factors[k] ?? 0) * weights[k]) / usedWeight])) as Record<FactorKey, number>;
    const weighted = 100 - keys.reduce((sum, k) => sum + deductions[k], 0);
    const score = Math.round(Math.max(0, Math.min(100, weighted, getAirScoreCap(pm25, aqi, weights.air))));

    const issues: string[] = [];
    const tempIssue = temperature > 18 ? HEAT_ISSUES.find(([t]) => temperature > t) : COLD_ISSUES.find(([t]) => temperature <= t);
    if (tempIssue) issues.push(tempIssue[1]);
    const dewIssue = DEW_POINT_ISSUES.find(([d]) => dewPoint > d);
    if (dewIssue) issues.push(dewIssue[1]);
    const airBand = getAirBand(pm25, aqi);
    if (airBand && AIR_ISSUES[airBand]) issues.push(AIR_ISSUES[airBand]);
    if (isNum(windSpeed) && windSpeed > 30) issues.push('風速過強');
    if (isNum(precipitationProbability) && precipitationProbability >= 60) issues.push('很可能下雨');

    const [level, text] = score >= 80 ? ['excellent', '絕佳'] : score >= 60 ? ['good', '良好'] : score >= 40 ? ['fair', '尚可'] : ['poor', '不佳'];
    return {
        level: level as 'excellent' | 'good' | 'fair' | 'poor',
        text, // 舒適度，不代表安全；安全看 safety
        score,
        factors,
        deductions,
        missing,
        issues,
        dewPoint: Math.round(dewPoint * 10) / 10,
        safety: getRunSafety({ temperature, humidity, windSpeed, pm25, aqi }),
    };
};

export type RunningCondition = ReturnType<typeof getRunningCondition>;

// 從未來時段挑「最適合」：先比安全（ok > caution），再比資料是否齊全，最後比分數；全部相同取最早的時段。
// 最好的時段若仍是 avoid（全部都不建議），回傳 -1，不標「最適合」。
const SAFETY_RANK: Record<SafetyLevel, number> = { ok: 0, caution: 1, avoid: 2 };
export const pickBestSlotIndex = (slots: Pick<RunningCondition, 'score' | 'missing' | 'safety'>[]): number => {
    const rank = (s: (typeof slots)[number]) => [SAFETY_RANK[s.safety.level], s.missing.length ? 1 : 0, -s.score];
    const isBetter = (a: number[], b: number[]) => {
        const j = a.findIndex((v, k) => v !== b[k]);
        return j !== -1 && a[j] < b[j];
    };
    let best = -1;
    slots.forEach((s, i) => {
        if (best === -1 || isBetter(rank(s), rank(slots[best]))) best = i;
    });
    return best === -1 || slots[best].safety.level === 'avoid' ? -1 : best;
};
