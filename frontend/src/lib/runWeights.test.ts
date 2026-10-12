import { describe, expect, it } from 'vitest';
import { adjustWeight, DEFAULT_WEIGHTS, FACTORS, isValidWeights, loadWeights, saveWeights, sumWeights, WEIGHT_MAX, WEIGHT_STEP, WEIGHTS_STORAGE_KEY } from './runWeights';

// 假的 localStorage；throws 模擬無痕或封鎖網站資料
const fakeStorage = (initial: Record<string, string> = {}, throws = false) => {
    const data = { ...initial };
    return {
        data,
        getItem: (k: string) => {
            if (throws) throw new Error('SecurityError');
            return data[k] ?? null;
        },
        setItem: (k: string, v: string) => {
            if (throws) throw new Error('QuotaExceededError');
            data[k] = v;
        },
    };
};

describe('預設權重', () => {
    it('總和 100 且本身合法', () => {
        expect(sumWeights(DEFAULT_WEIGHTS)).toBe(100);
        expect(isValidWeights(DEFAULT_WEIGHTS)).toBe(true);
    });
});

describe('adjustWeight', () => {
    it('只改按的那一項，不動其他項', () => {
        expect(adjustWeight(DEFAULT_WEIGHTS, 'air', -WEIGHT_STEP)).toEqual({ thermal: 45, air: 20, wind: 15, rain: 15 });
    });

    it('總和已滿 100 時不能再加', () => {
        expect(adjustWeight(DEFAULT_WEIGHTS, 'air', WEIGHT_STEP)).toBeNull();
    });

    it('有剩點數時可以加，直到 100', () => {
        const draft = { thermal: 40, air: 25, wind: 15, rain: 10 }; // 剩 10
        const once = adjustWeight(draft, 'rain', WEIGHT_STEP)!;
        expect(sumWeights(once)).toBe(95);
        expect(sumWeights(adjustWeight(once, 'air', WEIGHT_STEP)!)).toBe(100);
    });

    it('到單項上下限回傳 null（不變）', () => {
        expect(adjustWeight({ thermal: 60, air: 0, wind: 15, rain: 15 }, 'thermal', WEIGHT_STEP)).toBeNull(); // 上限 60
        expect(adjustWeight({ thermal: 10, air: 30, wind: 30, rain: 30 }, 'thermal', -WEIGHT_STEP)).toBeNull(); // 熱環境最少 10
        expect(adjustWeight({ thermal: 40, air: 0, wind: 30, rain: 30 }, 'air', -WEIGHT_STEP)).toBeNull();
    });

    it('隨機按 2000 次，總和不超過 100，每項都在範圍內且是 5 的倍數', () => {
        let w = { ...DEFAULT_WEIGHTS };
        let seed = 42;
        const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
        for (let i = 0; i < 2000; i += 1) {
            const f = FACTORS[Math.floor(rand() * FACTORS.length)];
            w = adjustWeight(w, f.key, rand() < 0.5 ? WEIGHT_STEP : -WEIGHT_STEP) ?? w;
            expect(sumWeights(w)).toBeLessThanOrEqual(100);
            for (const g of FACTORS) {
                expect(w[g.key] % WEIGHT_STEP).toBe(0);
                expect(w[g.key]).toBeGreaterThanOrEqual(g.min);
                expect(w[g.key]).toBeLessThanOrEqual(WEIGHT_MAX);
            }
        }
    });

    it('沒分配完的草稿不合法，不能拿來評分或儲存', () => {
        const draft = adjustWeight(DEFAULT_WEIGHTS, 'air', -WEIGHT_STEP)!;
        expect(isValidWeights(draft)).toBe(false);
    });
});

describe('isValidWeights', () => {
    it.each([
        ['總和不是 100', { thermal: 45, air: 25, wind: 15, rain: 20 }],
        ['不是 5 的倍數', { thermal: 44, air: 26, wind: 15, rain: 15 }],
        ['負數', { thermal: 70, air: -5, wind: 20, rain: 15 }],
        ['超過上限', { thermal: 70, air: 10, wind: 10, rain: 10 }],
        ['熱環境低於 10', { thermal: 5, air: 35, wind: 30, rain: 30 }],
        ['缺欄位', { thermal: 50, air: 25, wind: 25 }],
        ['字串', { thermal: '45', air: 25, wind: 15, rain: 15 }],
        ['不是物件', 'abc'],
        ['null', null],
    ])('%s → 不合法', (_, w) => {
        expect(isValidWeights(w)).toBe(false);
    });
});

describe('loadWeights / saveWeights', () => {
    const stored = (value: unknown) => fakeStorage({ [WEIGHTS_STORAGE_KEY]: typeof value === 'string' ? value : JSON.stringify(value) });

    it('第一次使用（沒有資料）回預設值', () => {
        expect(loadWeights(fakeStorage())).toEqual(DEFAULT_WEIGHTS);
    });

    it('儲存後重新載入得到同一組權重', () => {
        const s = fakeStorage();
        const w = { thermal: 30, air: 40, wind: 15, rain: 15 };
        saveWeights(w, s);
        expect(JSON.parse(s.data[WEIGHTS_STORAGE_KEY])).toEqual({ version: 1, weights: w });
        expect(loadWeights(s)).toEqual(w);
    });

    it('JSON 損壞回預設值', () => {
        expect(loadWeights(stored('{not json'))).toEqual(DEFAULT_WEIGHTS);
    });

    it('版本不對（舊版、未來版、沒版本）回預設值', () => {
        const w = { thermal: 30, air: 40, wind: 15, rain: 15 };
        expect(loadWeights(stored({ version: 0, weights: w }))).toEqual(DEFAULT_WEIGHTS);
        expect(loadWeights(stored({ version: 2, weights: w }))).toEqual(DEFAULT_WEIGHTS);
        expect(loadWeights(stored(w))).toEqual(DEFAULT_WEIGHTS);
    });

    it('內容不合法回預設值', () => {
        expect(loadWeights(stored({ version: 1, weights: { thermal: 100, air: 0, wind: 0, rain: 0 } }))).toEqual(DEFAULT_WEIGHTS);
        expect(loadWeights(stored({ version: 1, weights: null }))).toEqual(DEFAULT_WEIGHTS);
    });

    it('多餘欄位會被丟掉', () => {
        const w = { thermal: 30, air: 40, wind: 15, rain: 15 };
        expect(loadWeights(stored({ version: 1, weights: { ...w, uv: 10 } }))).toEqual(w);
    });

    it('存取 localStorage 丟錯時不會中斷：讀回預設值、寫入靜默失敗', () => {
        const s = fakeStorage({}, true);
        expect(loadWeights(s)).toEqual(DEFAULT_WEIGHTS);
        expect(() => saveWeights(DEFAULT_WEIGHTS, s)).not.toThrow();
    });

    it('沒有 localStorage（SSR／Node）時回預設值、存檔不丟錯', () => {
        expect(loadWeights(undefined)).toEqual(DEFAULT_WEIGHTS);
        expect(() => saveWeights(DEFAULT_WEIGHTS, undefined)).not.toThrow();
        // 不傳參數時用全域 localStorage；vitest 跑在 Node，沒有它也要正常
        expect(loadWeights()).toEqual(DEFAULT_WEIGHTS);
    });

    it('恢復預設值會寫回 storage', () => {
        const s = fakeStorage();
        saveWeights({ thermal: 30, air: 40, wind: 15, rain: 15 }, s);
        saveWeights({ ...DEFAULT_WEIGHTS }, s);
        expect(loadWeights(s)).toEqual(DEFAULT_WEIGHTS);
    });

    it('回傳的是複本，改了不會動到 DEFAULT_WEIGHTS', () => {
        const w = loadWeights(fakeStorage());
        w.air = 0;
        expect(DEFAULT_WEIGHTS.air).toBe(25);
    });
});
