// 跑步天氣的個人化權重：使用者只調「各因素多重要」，不碰各因素的計算曲線（曲線在 runningCondition.ts）。
export type FactorKey = 'thermal' | 'air' | 'wind' | 'rain';
export type Weights = Record<FactorKey, number>;

export const WEIGHT_STEP = 5;
export const WEIGHT_MAX = 60; // 單項上限，避免一個因素蓋掉其他全部
export const WEIGHT_TOTAL = 100;

// 預設點數是第一版的產品假設，不是研究驗證過的最佳比例；要調整只改這裡。
// 規格原本留給「其他因素」的 10 點併進空氣品質：目前沒有每個時段都有、又不和其他因素重複的資料
// （紫外線只有現在、沒有逐時預報），而舊版公式裡空氣品質是扣分上限最高的一項（80 分）。
// 熱環境最少 10 點：它是唯一保證有資料的因素（氣溫、濕度缺一就不評分），確保分數永遠有依據。
export const FACTORS: readonly { key: FactorKey; label: string; hint: string; min: number; points: number }[] = [
    { key: 'thermal', label: '氣溫與悶熱', hint: '太冷、太熱或濕熱難散熱', min: 10, points: 45 },
    { key: 'air', label: '空氣品質', hint: 'PM2.5 與 AQI，取兩者較差的', min: 0, points: 25 },
    { key: 'wind', label: '風速', hint: '強風讓配速和體感變差', min: 0, points: 15 },
    { key: 'rain', label: '降雨', hint: '降雨機率（不是雨量）', min: 0, points: 15 },
];

export const DEFAULT_WEIGHTS = Object.fromEntries(FACTORS.map((f) => [f.key, f.points])) as Weights;

export const sumWeights = (weights: Weights) => FACTORS.reduce((sum, f) => sum + weights[f.key], 0);

// 使用者自己分配：只改這一項，不動其他項。超出單項上下限或總和會超過 100 時回傳 null（不變）。
// 分配途中總和可能小於 100，這種草稿不能拿來評分或儲存（isValidWeights 會擋），畫面要提醒還剩幾點。
export const adjustWeight = (weights: Weights, key: FactorKey, delta: number): Weights | null => {
    const next = weights[key] + delta;
    if (next < FACTORS.find((f) => f.key === key)!.min || next > WEIGHT_MAX || sumWeights(weights) + delta > WEIGHT_TOTAL) return null;
    return { ...weights, [key]: next };
};

export const isValidWeights = (value: unknown): value is Weights => {
    if (typeof value !== 'object' || value === null) return false;
    const w = value as Record<string, unknown>;
    const ok = FACTORS.every((f) => {
        const v = w[f.key];
        return Number.isInteger(v) && (v as number) % WEIGHT_STEP === 0 && (v as number) >= f.min && (v as number) <= WEIGHT_MAX;
    });
    return ok && sumWeights(w as Weights) === WEIGHT_TOTAL;
};

// localStorage：{ version: 1, weights: {...} }。目前只有 v1；舊版、未來版、格式不對或總和不對都回預設值。
// 之後改了因素組成就升版號，並在 loadWeights 裡寫明舊版怎麼轉，轉不了就回預設值。
export const WEIGHTS_STORAGE_KEY = 'bb:wx:weights';
const WEIGHTS_VERSION = 1;

// 只在呼叫時才碰 localStorage：SSR／Node 沒有它，私密視窗或封鎖網站資料時讀取會丟錯
const browserStorage = (): Pick<Storage, 'getItem' | 'setItem'> | undefined => {
    try {
        return globalThis.localStorage;
    } catch {
        return undefined;
    }
};

export const loadWeights = (storage = browserStorage()): Weights => {
    try {
        const saved = JSON.parse(storage?.getItem(WEIGHTS_STORAGE_KEY) ?? 'null');
        if (saved?.version === WEIGHTS_VERSION && isValidWeights(saved.weights)) {
            return Object.fromEntries(FACTORS.map((f) => [f.key, saved.weights[f.key]])) as Weights; // 丟掉多餘欄位
        }
    } catch {
        // JSON 損壞或無法讀取，用預設值
    }
    return { ...DEFAULT_WEIGHTS };
};

// 存不了（無痕、空間滿）就只在這次瀏覽有效，評分照常
export const saveWeights = (weights: Weights, storage = browserStorage()) => {
    try {
        storage?.setItem(WEIGHTS_STORAGE_KEY, JSON.stringify({ version: WEIGHTS_VERSION, weights }));
    } catch {
        // 忽略
    }
};
