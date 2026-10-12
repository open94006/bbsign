import { describe, expect, it } from 'vitest';
import {
    calculateDewPoint,
    calculateHeatIndex,
    formatPace,
    getAirPenalty,
    getHeatStressLevel,
    getRainPenalty,
    getRunningCondition,
    getRunSafety,
    getThermalPenalty,
    getWindPenalty,
    PM25_BREAKPOINTS,
    pickBestSlotIndex,
    type RunningInput,
} from './runningCondition';
import { DEFAULT_WEIGHTS } from './runWeights';

// 中性天氣：15°C、50%、微風、空氣好、不下雨，每項不利程度都是 0
const NEUTRAL: RunningInput = { temperature: 15, humidity: 50, windSpeed: 5, pm25: 5, aqi: 20, precipitationProbability: 0 };
const run = (patch: Partial<RunningInput> = {}) => getRunningCondition({ ...NEUTRAL, ...patch });

describe('getThermalPenalty - 氣溫＋露點', () => {
    const dry = (t: number) => getThermalPenalty(t, 0); // 露點 0°C，只看氣溫

    it('12–18°C 最佳區間為 0', () => {
        expect(dry(12)).toBe(0);
        expect(dry(15)).toBe(0);
        expect(dry(18)).toBe(0);
    });

    it('錨點等於舊版級距上緣的扣分（換算成 /50）', () => {
        expect(dry(21)).toBeCloseTo((4 / 50) * 100);
        expect(dry(30)).toBeCloseTo((20 / 50) * 100);
        expect(dry(11)).toBeCloseTo((4 / 50) * 100);
        expect(dry(1)).toBeCloseTo((30 / 50) * 100);
    });

    it('18°C → 19°C 不再跳一整級（舊版直接跳 4 分）', () => {
        expect(dry(19) - dry(18)).toBeLessThan(3);
        expect(dry(19)).toBeGreaterThan(0);
    });

    it('越熱越不利、越冷越不利（單調）', () => {
        for (let t = 18; t < 40; t += 0.5) expect(dry(t + 0.5)).toBeGreaterThanOrEqual(dry(t));
        for (let t = 12; t > -5; t -= 0.5) expect(dry(t - 0.5)).toBeGreaterThanOrEqual(dry(t));
    });

    it('最熱最悶（36°C、露點 28°C）為 100；極冷最多 60', () => {
        expect(getThermalPenalty(36, 28)).toBe(100);
        expect(dry(-10)).toBeCloseTo(60);
    });

    it('露點 10°C 以下不扣，之後隨露點上升', () => {
        expect(getThermalPenalty(15, 9.9)).toBe(0);
        expect(getThermalPenalty(15, 15)).toBeCloseTo(6);
        expect(getThermalPenalty(15, 24)).toBeCloseTo(24);
    });
});

describe('getAirPenalty - PM2.5 與 AQI 同一項、取較差', () => {
    it('PM2.5 官方切點對應舊版扣分（換算成 /80）', () => {
        expect(getAirPenalty(PM25_BREAKPOINTS.good, null)).toBe(0);
        expect(getAirPenalty(PM25_BREAKPOINTS.moderate, null)).toBeCloseTo((15 / 80) * 100);
        expect(getAirPenalty(PM25_BREAKPOINTS.sensitiveUnhealthy, null)).toBeCloseTo((30 / 80) * 100);
        expect(getAirPenalty(PM25_BREAKPOINTS.unhealthy, null)).toBeCloseTo((50 / 80) * 100);
        expect(getAirPenalty(500, null)).toBe(100);
    });

    it('AQI 切點與 PM2.5 同級同分', () => {
        expect(getAirPenalty(null, 100)).toBeCloseTo(getAirPenalty(PM25_BREAKPOINTS.moderate, null)!);
        expect(getAirPenalty(null, 200)).toBeCloseTo(getAirPenalty(PM25_BREAKPOINTS.unhealthy, null)!);
    });

    it('兩者都有時取較差的一個，不相加', () => {
        const pmOnly = getAirPenalty(40, null)!;
        const aqiOnly = getAirPenalty(null, 160)!;
        expect(getAirPenalty(40, 160)).toBe(Math.max(pmOnly, aqiOnly));
        expect(getAirPenalty(40, 20)).toBe(pmOnly);
    });

    it('兩者都沒有回傳 null（缺資料，不是 0）', () => {
        expect(getAirPenalty(null, undefined)).toBeNull();
        expect(getAirPenalty(Number.NaN, null)).toBeNull();
    });
});

describe('getWindPenalty / getRainPenalty', () => {
    it('風速 20 km/h 以下為 0，40 以上為 100，中間連續', () => {
        expect(getWindPenalty(20)).toBe(0);
        expect(getWindPenalty(30)).toBeCloseTo((8 / 15) * 100);
        expect(getWindPenalty(40)).toBe(100);
        expect(getWindPenalty(60)).toBe(100);
    });

    it('降雨機率直接當不利程度，限制在 0–100', () => {
        expect(getRainPenalty(0)).toBe(0);
        expect(getRainPenalty(30)).toBe(30);
        expect(getRainPenalty(120)).toBe(100);
        expect(getRainPenalty(-5)).toBe(0);
    });
});

describe('getRunningCondition - 加權總分', () => {
    it('中性天氣 100 分、絕佳、無缺資料', () => {
        const r = run();
        expect(r.score).toBe(100);
        expect(r.level).toBe('excellent');
        expect(r.missing).toEqual([]);
    });

    it('S = 100 − Σ W·P / 100（資料齊全）', () => {
        const r = run({ temperature: 30, humidity: 60, windSpeed: 30, pm25: 35.4, precipitationProbability: 40 });
        const expected = 100 - (Object.keys(r.factors) as (keyof typeof r.factors)[]).reduce((s, k) => s + (DEFAULT_WEIGHTS[k] * r.factors[k]!) / 100, 0);
        expect(r.score).toBe(Math.round(expected));
    });

    it('分數限制在 0–100：所有因素最差時為 0', () => {
        const r = run({ temperature: 40, humidity: 90, windSpeed: 80, pm25: 500, precipitationProbability: 100 });
        expect(r.score).toBe(0);
        expect(r.level).toBe('poor');
    });

    it('分級邊界 80 / 60 / 40', () => {
        // 只有降雨不利，降雨權重 100 以外都 0 不合法，所以用自訂權重 + 降雨機率精準控制分數
        const w = { thermal: 40, air: 0, wind: 0, rain: 60 };
        const at = (pop: number) => run({ precipitationProbability: pop, weights: w });
        expect(at((20 / 60) * 100).level).toBe('excellent'); // 80
        expect(at((21 / 60) * 100).level).toBe('good'); // 79
        expect(at((40 / 60) * 100).level).toBe('good'); // 60
        expect(at((41 / 60) * 100).level).toBe('fair'); // 59
        expect(at(100).score).toBe(40);
        expect(at(100).level).toBe('fair');
    });

    it('濕度不再單獨扣分：涼爽潮濕（15°C、85%）只剩露點 12.5°C 的輕微影響', () => {
        // 舊版：濕度 > 80 扣 8 + 露點扣 3 = 89 分
        expect(run({ humidity: 85 }).score).toBe(99);
    });

    it('PM2.5 與 AQI 同時很差也只扣一次', () => {
        const both = run({ pm25: 150.4, aqi: 200 });
        const pmOnly = run({ pm25: 150.4, aqi: null });
        expect(both.score).toBe(pmOnly.score);
    });

    it('回傳露點與文字標籤', () => {
        const r = run({ temperature: 26, humidity: 100 });
        expect(r.dewPoint).toBeCloseTo(26, 0);
        expect(r.issues).toEqual(expect.arrayContaining(['氣溫微偏高', '極度悶熱']));
        expect(run({ pm25: 35.5 }).issues).toContain('空氣對敏感族群不友善');
        expect(run({ windSpeed: 35 }).issues).toContain('風速過強');
    });
});

describe('getRunningCondition - 自訂權重', () => {
    const muggy = { temperature: 30, humidity: 75 };

    it('權重只改加權，不改各因素的不利程度', () => {
        const a = run({ ...muggy, weights: DEFAULT_WEIGHTS });
        const b = run({ ...muggy, weights: { thermal: 10, air: 30, wind: 30, rain: 30 } });
        expect(b.factors).toEqual(a.factors);
        expect(b.score).toBeGreaterThan(a.score);
    });

    it('熱環境權重越高，悶熱天分數越低', () => {
        const low = run({ ...muggy, weights: { thermal: 25, air: 25, wind: 25, rain: 25 } });
        const high = run({ ...muggy, weights: { thermal: 60, air: 10, wind: 15, rain: 15 } });
        expect(high.score).toBeLessThan(low.score);
    });
});

describe('getRunningCondition - 缺資料', () => {
    it('缺降雨與風速時列在 missing，不當成理想天氣', () => {
        const r = run({ precipitationProbability: null, windSpeed: undefined });
        expect(r.missing).toEqual(['wind', 'rain']);
        expect(r.factors.rain).toBeNull();
        expect(r.deductions.rain).toBe(0);
    });

    it('缺的因素從分母拿掉，用其餘權重重新正規化', () => {
        // 熱環境 P、權重 45；空氣 0、權重 25 → 100 − 45P/70
        const r = run({ temperature: 30, humidity: 70, windSpeed: null, precipitationProbability: null });
        expect(r.score).toBe(Math.round(100 - (45 * r.factors.thermal!) / 70));
    });

    it('缺資料不會比資料齊全但天氣一樣的時段分數更高（無利多偏誤）', () => {
        const full = run({ temperature: 30, humidity: 70, precipitationProbability: 0 });
        const partial = run({ temperature: 30, humidity: 70, precipitationProbability: null });
        expect(partial.score).toBeLessThanOrEqual(full.score);
    });
});

describe('calculateDewPoint - 露點計算（Magnus 公式）', () => {
    it('濕度 100% 時，露點應等於氣溫', () => {
        expect(calculateDewPoint(20, 100)).toBeCloseTo(20, 1);
        expect(calculateDewPoint(5, 100)).toBeCloseTo(5, 1);
    });

    it('濕度越低，露點應低於氣溫', () => {
        expect(calculateDewPoint(30, 40)).toBeLessThan(30);
    });
});

describe('calculateHeatIndex - NWS 熱指數', () => {
    it('對照 NWS 熱指數表（°F）', () => {
        const f = (tF: number, rh: number) => (calculateHeatIndex(((tF - 32) * 5) / 9, rh) * 9) / 5 + 32;
        expect(f(90, 65)).toBeCloseTo(103, 0);
        expect(f(96, 50)).toBeCloseTo(108, 0);
        expect(f(86, 40)).toBeCloseTo(85, 0);
    });

    it('低於 80°F 時用簡式，接近氣溫', () => {
        expect(Math.abs(calculateHeatIndex(20, 50) - 20)).toBeLessThan(1);
    });
});

describe('getRunSafety - 安全狀態獨立於權重', () => {
    it('中性天氣 ok', () => {
        expect(getRunSafety(NEUTRAL)).toEqual({ level: 'ok', reasons: [] });
    });

    it('熱指數 ≥ 39.4°C 為 avoid，32.2–39.4 為 caution', () => {
        expect(getRunSafety({ ...NEUTRAL, temperature: 33, humidity: 65 }).level).toBe('avoid');
        expect(getRunSafety({ ...NEUTRAL, temperature: 30, humidity: 60 }).level).toBe('caution');
        expect(getRunSafety({ ...NEUTRAL, temperature: 27, humidity: 60 }).level).toBe('ok');
    });

    it('空氣：AQI > 150 或 PM2.5 > 55.4 為 avoid，敏感族群級為 caution；取兩者較差', () => {
        expect(getRunSafety({ ...NEUTRAL, pm25: 55.5 }).level).toBe('avoid');
        expect(getRunSafety({ ...NEUTRAL, pm25: 5, aqi: 151 }).level).toBe('avoid');
        expect(getRunSafety({ ...NEUTRAL, pm25: 40 }).level).toBe('caution');
        expect(getRunSafety({ ...NEUTRAL, pm25: null, aqi: null }).level).toBe('ok');
    });

    it('強風（≥ 39 km/h）為 caution', () => {
        expect(getRunSafety({ ...NEUTRAL, windSpeed: 39 }).level).toBe('caution');
    });

    it('熱環境權重調到最低，極端熱仍是 avoid', () => {
        const r = run({ temperature: 35, humidity: 70, weights: { thermal: 10, air: 30, wind: 30, rain: 30 } });
        expect(r.score).toBeGreaterThanOrEqual(80); // 舒適度可能很高
        expect(r.safety.level).toBe('avoid'); // 但安全提示不受影響
    });

    it('空氣權重 0 時，嚴重污染仍是 avoid', () => {
        const r = run({ pm25: 200, weights: { thermal: 40, air: 0, wind: 30, rain: 30 } });
        expect(r.score).toBe(100);
        expect(r.safety.level).toBe('avoid');
    });
});

describe('getHeatStressLevel - 溫度+露點總和悶熱分級', () => {
    it('四個切點：<=37 none、<=43 slight、<=49 moderate、否則 severe', () => {
        expect(getHeatStressLevel(20, 15)).toBe('none'); // 35
        expect(getHeatStressLevel(25, 15)).toBe('slight'); // 40
        expect(getHeatStressLevel(28, 18)).toBe('moderate'); // 46
        expect(getHeatStressLevel(30, 22)).toBe('severe'); // 52
    });
});

describe('formatPace - 配速格式化', () => {
    it('375 秒 → 6\'15"', () => {
        expect(formatPace(375)).toBe("6'15\"");
    });

    it('秒數需補零（360 秒 → 6\'00"）', () => {
        expect(formatPace(360)).toBe("6'00\"");
    });

    it('365 秒 → 6\'05"', () => {
        expect(formatPace(365)).toBe("6'05\"");
    });
});

describe('pickBestSlotIndex - 未來時段挑最適合', () => {
    const slot = (score: number, level: 'ok' | 'caution' | 'avoid' = 'ok', missing: string[] = []) => ({ score, missing: missing as never[], safety: { level, reasons: [] } });

    it('選出分數最高的索引', () => {
        expect(pickBestSlotIndex([slot(60), slot(90), slot(75), slot(40)])).toBe(1);
    });

    it('同分時取最早出現的索引', () => {
        expect(pickBestSlotIndex([slot(80), slot(80), slot(30)])).toBe(0);
    });

    it('空陣列回傳 -1', () => {
        expect(pickBestSlotIndex([])).toBe(-1);
    });

    it('安全優先：caution 的 95 分輸給 ok 的 70 分', () => {
        expect(pickBestSlotIndex([slot(95, 'caution'), slot(70)])).toBe(1);
    });

    it('資料不完整的高分不會勝過資料齊全的時段', () => {
        expect(pickBestSlotIndex([slot(95, 'ok', ['rain']), slot(70)])).toBe(1);
        expect(pickBestSlotIndex([slot(95, 'ok', ['rain']), slot(70, 'ok', ['rain'])])).toBe(0);
    });

    it('全部 avoid 時不標最適合', () => {
        expect(pickBestSlotIndex([slot(90, 'avoid'), slot(80, 'avoid')])).toBe(-1);
    });

    it('改權重後推薦跟著變', () => {
        const slots = [
            { temperature: 27, humidity: 80, precipitationProbability: 0 }, // 悶熱（熱指數仍未達留意）、不下雨
            { temperature: 22, humidity: 60, precipitationProbability: 70 }, // 涼、很可能下雨
        ];
        const pick = (weights: RunningInput['weights']) => pickBestSlotIndex(slots.map((s) => run({ ...s, weights })));
        expect(pick({ thermal: 60, air: 10, wind: 15, rain: 15 })).toBe(1);
        expect(pick({ thermal: 25, air: 0, wind: 15, rain: 60 })).toBe(0);
    });
});
