// 16 方位羅盤，供風向具體化顯示（例如「東北風」）
const COMPASS_DIRECTIONS = ['北', '北北東', '東北', '東北東', '東', '東南東', '東南', '南南東', '南', '南南西', '西南', '西南西', '西', '西北西', '西北', '北北西'];

export const getCompassDirection = (deg: number): string => {
    const normalized = ((deg % 360) + 360) % 360;
    const index = Math.round(normalized / 22.5) % 16;
    return COMPASS_DIRECTIONS[index];
};

// 環境部 AQI 六級（上限 50/100/150/200/300/500），活動建議改寫成跑者用語
const AQI_BANDS: [number, string][] = [
    [50, '空氣乾淨，放心到戶外跑。'],
    [100, '可以照常跑；對空氣特別敏感的人留意咳嗽或呼吸急促。'],
    [150, '有氣喘、過敏或心肺疾病的人改室內或降低強度；其他人避開長距離與間歇。'],
    [200, '不建議戶外跑，改跑步機；非跑不可就縮短時間、放慢配速。'],
    [300, '避免戶外運動。'],
    [500, '避免外出，留在室內並關窗。'],
];

// index 0–5 對應六級色；position 0–1 是在六等分刻度上的位置（每級各佔 1/6，級內線性）
export const getAqiBand = (aqi: number) => {
    const found = AQI_BANDS.findIndex(([max]) => aqi <= max);
    const index = found === -1 ? AQI_BANDS.length - 1 : found;
    const lo = index === 0 ? 0 : AQI_BANDS[index - 1][0];
    const hi = AQI_BANDS[index][0];
    const position = Math.min(1, (index + Math.max(0, aqi - lo) / (hi - lo)) / AQI_BANDS.length);
    return { index, position, advice: AQI_BANDS[index][1] };
};
