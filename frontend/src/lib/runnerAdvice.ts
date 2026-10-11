import { getHeatStressLevel, type HeatStressLevel } from './runningCondition';

// 16 方位羅盤，供風向具體化顯示（例如「東北風」）
const COMPASS_DIRECTIONS = ['北', '北北東', '東北', '東北東', '東', '東南東', '東南', '南南東', '南', '南南西', '西南', '西南西', '西', '西北西', '西北', '北北西'];

export const getCompassDirection = (deg: number): string => {
    const normalized = ((deg % 360) + 360) % 360;
    const index = Math.round(normalized / 22.5) % 16;
    return COMPASS_DIRECTIONS[index];
};

export type ClothingAdvice = { title: string; description: string };

// 穿著建議：採用跑圈通用的「穿得比體感冷 10°C」原則分四檔
export const getClothingAdvice = (feelsLikeC: number): ClothingAdvice => {
    if (feelsLikeC > 25) return { title: '背心 + 短褲', description: '體感偏熱，選擇輕薄透氣排汗衣物，減少悶熱感。' };
    if (feelsLikeC >= 15) return { title: '短袖 + 短褲', description: '體感舒適，一般短袖跑衣即可。' };
    if (feelsLikeC >= 5) return { title: '長袖薄外套', description: '體感偏涼，建議長袖或薄外套，身體跑熱後會回溫，不需穿太厚。' };
    return { title: '保暖層 + 手套', description: '體感寒冷，建議多層次穿著、加手套與頭帽，注意四肢末梢保暖。' };
};

export type HydrationAdvice = { minMl: number; maxMl: number; message: string };

// 每小時建議補水量（ml）依「溫度+露點」悶熱分級
const HYDRATION_ML_PER_HOUR: Record<HeatStressLevel, [number, number]> = {
    none: [400, 500],
    slight: [500, 600],
    moderate: [600, 750],
    severe: [750, 900],
};

export const getHydrationAdvice = (tempC: number, dewPointC: number, durationMinutes: number): HydrationAdvice => {
    const [baseMin, baseMax] = HYDRATION_ML_PER_HOUR[getHeatStressLevel(tempC, dewPointC)];
    const hours = durationMinutes / 60;
    const roundTo50 = (ml: number) => Math.round(ml / 50) * 50;
    const minMl = roundTo50(baseMin * hours);
    const maxMl = roundTo50(baseMax * hours);
    return { minMl, maxMl, message: `預計跑 ${durationMinutes} 分鐘，建議補水 ${minMl}-${maxMl} ml。` };
};
