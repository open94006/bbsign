import { describe, expect, it } from 'vitest';
import { calculateDewPoint, formatPace, getHeatStressLevel, getRunningCondition, getTrainingPaces, PM25_BREAKPOINTS, pickBestSlotIndex } from './runningCondition';

describe('getRunningCondition - PM2.5 官方對照表切點', () => {
    // 溫度/濕度/風速固定在中性值，只測 PM2.5 這一個變因
    const NEUTRAL_TEMP = 15;
    const NEUTRAL_HUMIDITY = 50;
    const NEUTRAL_WIND = 5;
    const run = (pm25: number) => getRunningCondition(NEUTRAL_TEMP, undefined, pm25, NEUTRAL_HUMIDITY, NEUTRAL_WIND);

    it('PM2.5 = 12.0（良好上緣）不扣分', () => {
        expect(run(PM25_BREAKPOINTS.good).penalties.airQuality).toBe(0);
    });

    it('PM2.5 = 35.4（普通上緣）扣 15 分', () => {
        expect(run(PM25_BREAKPOINTS.moderate).penalties.airQuality).toBe(15);
    });

    it('PM2.5 = 35.5（進入敏感族群不健康）扣 30 分', () => {
        const result = run(35.5);
        expect(result.penalties.airQuality).toBe(30);
        expect(result.issues).toContain('PM2.5 對敏感族群不友善');
    });

    it('PM2.5 = 55.4（敏感族群不健康上緣）扣 30 分', () => {
        expect(run(PM25_BREAKPOINTS.sensitiveUnhealthy).penalties.airQuality).toBe(30);
    });

    it('PM2.5 = 150.4（不健康上緣）扣 50 分', () => {
        expect(run(PM25_BREAKPOINTS.unhealthy).penalties.airQuality).toBe(50);
    });

    it('PM2.5 = 250.5（超過非常不健康上緣）扣 80 分，issue 含危害健康', () => {
        const result = run(250.5);
        expect(result.penalties.airQuality).toBe(80);
        expect(result.issues).toContain('PM2.5 危害健康');
    });

    it('舊切點邊界值（41、54.4、70）不再對應舊的扣分數字（34/47/60）', () => {
        expect(run(41).penalties.airQuality).not.toBe(34);
        expect(run(54.4).penalties.airQuality).not.toBe(47);
        expect(run(70).penalties.airQuality).not.toBe(60);
    });
});

describe('getRunningCondition - 既有溫度/濕度/風速行為（防止搬移時改壞）', () => {
    it('最佳溫度區間 15°C、低濕度、無風不扣分，總分 100', () => {
        const result = getRunningCondition(15, undefined, undefined, 50, 5);
        expect(result.score).toBe(100);
        expect(result.level).toBe('excellent');
    });

    it('濕度 > 80% 扣 8 分（濕熱主要改由露點衡量，避免與露點雙重扣分）', () => {
        const result = getRunningCondition(15, undefined, undefined, 85, 5);
        expect(result.penalties.humidity).toBe(8);
    });

    it('風速 > 30 km/h 扣 15 分', () => {
        const result = getRunningCondition(15, undefined, undefined, 50, 35);
        expect(result.penalties.wind).toBe(15);
    });

    it('極端高溫 > 33°C 扣 30 分', () => {
        const result = getRunningCondition(35, undefined, undefined, 50, 5);
        expect(result.penalties.temperature).toBe(30);
    });
});

describe('calculateDewPoint - 露點計算（Magnus 公式）', () => {
    it('濕度 100% 時，露點應等於氣溫（物理特性：飽和時露點=氣溫）', () => {
        expect(calculateDewPoint(20, 100)).toBeCloseTo(20, 1);
        expect(calculateDewPoint(5, 100)).toBeCloseTo(5, 1);
    });

    it('濕度越低，露點應低於氣溫', () => {
        expect(calculateDewPoint(30, 40)).toBeLessThan(30);
    });
});

describe('getRunningCondition - 露點評分（取代單純濕度衡量濕熱）', () => {
    // 用濕度 100% 讓露點精確等於氣溫，藉此控制測試落在哪一個露點級距
    it('露點 < 10°C 不扣分', () => {
        const result = getRunningCondition(5, undefined, undefined, 100, 5);
        expect(result.penalties.dewPoint).toBe(0);
    });

    it('露點 12°C（10-15 區間）扣 3 分', () => {
        const result = getRunningCondition(12, undefined, undefined, 100, 5);
        expect(result.penalties.dewPoint).toBe(3);
    });

    it('露點 18°C（16-20 區間）扣 5 分，issue 含悶熱感明顯', () => {
        const result = getRunningCondition(18, undefined, undefined, 100, 5);
        expect(result.penalties.dewPoint).toBe(5);
        expect(result.issues).toContain('悶熱感明顯');
    });

    it('露點 22°C（21-24 區間）扣 12 分，issue 含悶熱難耐', () => {
        const result = getRunningCondition(22, undefined, undefined, 100, 5);
        expect(result.penalties.dewPoint).toBe(12);
        expect(result.issues).toContain('悶熱難耐');
    });

    it('露點 26°C（> 24）扣 20 分，issue 含極度悶熱', () => {
        const result = getRunningCondition(26, undefined, undefined, 100, 5);
        expect(result.penalties.dewPoint).toBe(20);
        expect(result.issues).toContain('極度悶熱');
    });

    it('回傳結果包含 dewPoint 數值供 UI 顯示', () => {
        const result = getRunningCondition(20, undefined, undefined, 100, 5);
        expect(result.dewPoint).toBeCloseTo(20, 0);
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

describe('getTrainingPaces - Daniels VDOT 訓練配速', () => {
    it('10K 50:00（5\'00"/km）→ VDOT 約 40（Daniels 表：VDOT 40 ≈ 10K 49:48），且 E > T > I（秒/公里遞減）', () => {
        const paces = getTrainingPaces(10, 300);
        expect(paces.vdot).toBeCloseTo(40, 0);
        expect(paces.easy.maxSecPerKm).toBeGreaterThan(paces.easy.minSecPerKm);
        expect(paces.easy.minSecPerKm).toBeGreaterThan(paces.tempo.maxSecPerKm);
        expect(paces.tempo.minSecPerKm).toBeGreaterThan(paces.interval.maxSecPerKm);
        // 10K 比賽配速介於 T 與 I 之間（Daniels 表 VDOT 40：T 5\'06"、I 4\'42"）
        expect(paces.tempo.minSecPerKm).toBeGreaterThan(300);
        expect(paces.interval.maxSecPerKm).toBeLessThan(300);
    });

    it('同配速跑更長距離代表更強，VDOT 應更高', () => {
        expect(getTrainingPaces(42.195, 300).vdot).toBeGreaterThan(getTrainingPaces(5, 300).vdot);
    });
});

describe('getRunningCondition - tolerance 耐熱/耐寒偏好（只影響熱側）', () => {
    it('不傳 tolerance 時，行為應與 tolerance="normal" 完全一致（無回歸）', () => {
        const withoutArg = getRunningCondition(30, undefined, undefined, 50, 5);
        const withNormal = getRunningCondition(30, undefined, undefined, 50, 5, 'normal');
        expect(withoutArg.score).toBe(withNormal.score);
        expect(withoutArg.penalties).toEqual(withNormal.penalties);
    });

    it('高溫時，tolerance="heat"（怕熱）扣分應大於 normal', () => {
        const normal = getRunningCondition(32, undefined, undefined, 50, 5, 'normal');
        const heat = getRunningCondition(32, undefined, undefined, 50, 5, 'heat');
        expect(heat.penalties.temperature).toBeGreaterThan(normal.penalties.temperature);
    });

    it('高溫時，tolerance="cold"（怕熱程度低）扣分應小於 normal', () => {
        const normal = getRunningCondition(32, undefined, undefined, 50, 5, 'normal');
        const cold = getRunningCondition(32, undefined, undefined, 50, 5, 'cold');
        expect(cold.penalties.temperature).toBeLessThan(normal.penalties.temperature);
    });

    it('低溫（冷側）時，三種 tolerance 扣分應完全相同（偏好只作用在熱側）', () => {
        const normal = getRunningCondition(3, undefined, undefined, 50, 5, 'normal');
        const heat = getRunningCondition(3, undefined, undefined, 50, 5, 'heat');
        const cold = getRunningCondition(3, undefined, undefined, 50, 5, 'cold');
        expect(heat.penalties.temperature).toBe(normal.penalties.temperature);
        expect(cold.penalties.temperature).toBe(normal.penalties.temperature);
    });

    it('露點扣分（濕熱）也受 tolerance 影響：heat 應大於 normal', () => {
        const normal = getRunningCondition(26, undefined, undefined, 100, 5, 'normal');
        const heat = getRunningCondition(26, undefined, undefined, 100, 5, 'heat');
        expect(heat.penalties.dewPoint).toBeGreaterThan(normal.penalties.dewPoint);
    });
});

describe('pickBestSlotIndex - 未來時段挑最佳可跑度', () => {
    it('選出分數最高的索引', () => {
        expect(pickBestSlotIndex([60, 90, 75, 40])).toBe(1);
    });

    it('同分時取最早出現的索引', () => {
        expect(pickBestSlotIndex([80, 80, 30])).toBe(0);
    });

    it('空陣列回傳 -1', () => {
        expect(pickBestSlotIndex([])).toBe(-1);
    });
});
