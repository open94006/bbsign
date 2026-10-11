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

// 悶熱分級：跑圈常用「溫度+露點總和」法則（Runner's World 等廣泛引用），供補水量與日落後跑建議使用
export const getHeatStressLevel = (tempC: number, dewPointC: number): HeatStressLevel => {
    const sum = tempC + dewPointC;
    if (sum <= 37) return 'none';
    if (sum <= 43) return 'slight';
    if (sum <= 49) return 'moderate';
    return 'severe';
};

export type PaceRange = { minSecPerKm: number; maxSecPerKm: number };
export type TrainingPaces = { vdot: number; easy: PaceRange; tempo: PaceRange; interval: PaceRange };

// Daniels–Gilbert（Oxygen Power, 1979）：由目標距離＋配速反推 VDOT，再依 Daniels' Running Formula 的強度區間換算訓練配速
// E 59–74%、T 83–88%、I 95–100% VDOT。速度單位 m/min。
export const getTrainingPaces = (distanceKm: number, secPerKm: number): TrainingPaces => {
    const timeMin = (distanceKm * secPerKm) / 60;
    const velocity = (distanceKm * 1000) / timeMin;
    const vo2 = -4.6 + 0.182258 * velocity + 0.000104 * velocity ** 2;
    const pctMax = 0.8 + 0.1894393 * Math.exp(-0.012778 * timeMin) + 0.2989558 * Math.exp(-0.1932605 * timeMin);
    const vdot = vo2 / pctMax;

    // 反解二次式 0.000104v² + 0.182258v − (4.6 + VO2) = 0，取正根
    const paceAt = (fraction: number) => {
        const target = vdot * fraction;
        const v = (-0.182258 + Math.sqrt(0.182258 ** 2 + 4 * 0.000104 * (4.6 + target))) / (2 * 0.000104);
        return Math.round(60000 / v);
    };
    // 比例愈高跑愈快，所以 min（較快）對應區間上限
    const range = (lo: number, hi: number): PaceRange => ({ minSecPerKm: paceAt(hi), maxSecPerKm: paceAt(lo) });

    return {
        vdot: Math.round(vdot * 10) / 10,
        easy: range(0.59, 0.74),
        tempo: range(0.83, 0.88),
        interval: range(0.95, 1.0),
    };
};

// 將秒/公里格式化為跑者慣用的 6'15" 格式
export const formatPace = (secPerKm: number): string => {
    const totalSeconds = Math.round(secPerKm);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}'${seconds.toString().padStart(2, '0')}"`;
};

// 耐熱/耐寒偏好：描述「哪種天氣讓這個人比較不舒服」，只影響熱側（溫度 > 18°C 與露點）評分，
// 冷側不受影響——台灣跑者的主要痛點是濕熱，這樣設計避免「怕熱的人在低溫反而被多扣分」的反直覺結果。
export type RunnerTolerance = 'heat' | 'normal' | 'cold';
const HEAT_SIDE_TOLERANCE_FACTOR: Record<RunnerTolerance, number> = {
    heat: 1.3, // 比較怕熱：熱側扣分放大
    normal: 1,
    cold: 0.7, // 比較不怕熱（怕冷）：熱側扣分縮小
};

// 跑步建議等級
export const getRunningCondition = (temp: number, aqi: number | undefined, pm25: number | undefined, humidity: number, windSpeed: number, tolerance: RunnerTolerance = 'normal') => {
    let score = 100;
    const issues: string[] = [];
    let airQualityHint = '空氣資料不足';
    const penalties = {
        temperature: 0,
        airQuality: 0,
        humidity: 0,
        dewPoint: 0,
        wind: 0,
    };
    const heatSideFactor = HEAT_SIDE_TOLERANCE_FACTOR[tolerance];

    // 溫度評分（細化分段，最佳區 12-18°C）。熱側（>18°C）依 tolerance 縮放，冷側（<=11°C）不受影響。
    let temperaturePenalty = 0;
    let temperatureIssue: string | null = null;
    let isHeatSide = false;

    if (temp <= 1) {
        temperaturePenalty = 30;
        temperatureIssue = '氣溫極端偏低';
    } else if (temp <= 3) {
        temperaturePenalty = 26;
        temperatureIssue = '氣溫過低';
    } else if (temp <= 5) {
        temperaturePenalty = 20;
        temperatureIssue = '氣溫偏低';
    } else if (temp <= 7) {
        temperaturePenalty = 14;
        temperatureIssue = '氣溫微偏低';
    } else if (temp <= 9) {
        temperaturePenalty = 8;
        temperatureIssue = '氣溫稍低';
    } else if (temp <= 11) {
        temperaturePenalty = 4;
    } else if (temp <= 18) {
        // 最佳區間，不扣分
    } else if (temp <= 21) {
        temperaturePenalty = 4;
        isHeatSide = true;
    } else if (temp <= 24) {
        temperaturePenalty = 8;
        temperatureIssue = '氣溫稍高';
        isHeatSide = true;
    } else if (temp <= 27) {
        temperaturePenalty = 14;
        temperatureIssue = '氣溫微偏高';
        isHeatSide = true;
    } else if (temp <= 30) {
        temperaturePenalty = 20;
        temperatureIssue = '氣溫偏高';
        isHeatSide = true;
    } else if (temp <= 33) {
        temperaturePenalty = 26;
        temperatureIssue = '氣溫過高';
        isHeatSide = true;
    } else {
        temperaturePenalty = 30;
        temperatureIssue = '氣溫極端偏高';
        isHeatSide = true;
    }

    const scaledTemperaturePenalty = isHeatSide ? Math.round(temperaturePenalty * heatSideFactor) : temperaturePenalty;
    score -= scaledTemperaturePenalty;
    penalties.temperature += scaledTemperaturePenalty;
    if (temperatureIssue) issues.push(temperatureIssue);

    // 空氣品質評分（以 PM2.5 為主，AQI 僅做提示）
    const hasPm25 = typeof pm25 === 'number' && Number.isFinite(pm25);
    const aqiText = aqi
        ? {
              1: '良好',
              2: '普通',
              3: '敏感族群不健康',
              4: '不健康',
              5: '非常不健康',
          }[aqi] || '未知'
        : '無資料';

    if (hasPm25) {
        const pm = pm25 as number;
        // 官方 EPA / 台灣 moenv PM2.5 sub-index 對照表（12/35.4/55.4/150.4/250.4 μg/m³）
        // 這組切點與後端 convertMoenvAqiToLevel 的 raw AQI 切點（50/100/150/200）一一對應，
        // 確保 PM2.5 判定與 AQI 等級不會互相矛盾。
        if (pm <= PM25_BREAKPOINTS.good) {
            // 不扣分（AQI 0-50 良好）
        } else if (pm <= PM25_BREAKPOINTS.moderate) {
            score -= 15;
            penalties.airQuality += 15;
        } else if (pm <= PM25_BREAKPOINTS.sensitiveUnhealthy) {
            score -= 30;
            penalties.airQuality += 30;
            issues.push('PM2.5 對敏感族群不友善');
        } else if (pm <= PM25_BREAKPOINTS.unhealthy) {
            score -= 50;
            penalties.airQuality += 50;
            issues.push('PM2.5 不佳');
        } else if (pm <= PM25_BREAKPOINTS.veryUnhealthy) {
            score -= 65;
            penalties.airQuality += 65;
            issues.push('PM2.5 很差');
        } else {
            score -= 80;
            penalties.airQuality += 80;
            issues.push('PM2.5 危害健康');
        }

        airQualityHint = aqi ? `PM2.5 ${pm.toFixed(1)} μg/m³｜AQI ${aqi}（${aqiText}）` : `PM2.5 ${pm.toFixed(1)} μg/m³｜AQI 無資料`;
    } else if (aqi) {
        if (aqi >= 4) {
            score -= 72;
            penalties.airQuality += 72;
            issues.push('空氣品質差');
        } else if (aqi >= 3) {
            score -= 46;
            penalties.airQuality += 46;
            issues.push('空氣品質普通');
        } else if (aqi >= 2) {
            score -= 21;
            penalties.airQuality += 21;
        }
        airQualityHint = `PM2.5 無資料｜AQI ${aqi}（${aqiText}）`;
    }

    // 濕度評分（僅作基礎懲罰，濕熱主要以下方露點衡量，避免雙重扣分）
    if (humidity > 80) {
        score -= 8;
        penalties.humidity += 8;
        issues.push('濕度過高');
    } else if (humidity > 70) {
        score -= 4;
        penalties.humidity += 4;
    }

    // 露點評分（體感濕熱的主要依據：同樣濕度，氣溫愈高愈悶熱，露點能反映這個差異）
    // 露點恆屬熱側（只在悶熱時扣分），一律套用 tolerance 縮放
    const dewPoint = calculateDewPoint(temp, humidity);
    let dewPointPenalty = 0;
    let dewPointIssue: string | null = null;

    if (dewPoint < 10) {
        // 舒適，不扣分
    } else if (dewPoint <= 15) {
        dewPointPenalty = 3;
    } else if (dewPoint <= 20) {
        dewPointPenalty = 5;
        dewPointIssue = '悶熱感明顯';
    } else if (dewPoint <= 24) {
        dewPointPenalty = 12;
        dewPointIssue = '悶熱難耐';
    } else {
        dewPointPenalty = 20;
        dewPointIssue = '極度悶熱';
    }

    const scaledDewPointPenalty = Math.round(dewPointPenalty * heatSideFactor);
    score -= scaledDewPointPenalty;
    penalties.dewPoint += scaledDewPointPenalty;
    if (dewPointIssue) issues.push(dewPointIssue);

    // 風速評分
    if (windSpeed > 30) {
        score -= 15;
        penalties.wind += 15;
        issues.push('風速過強');
    } else if (windSpeed > 20) {
        score -= 8;
        penalties.wind += 8;
    }

    score = Math.max(0, Math.min(100, score));
    const roundedDewPoint = Math.round(dewPoint * 10) / 10;

    if (score >= 80)
        return {
            level: 'excellent',
            text: '絕佳',
            issues,
            score,
            penalties,
            airQualityHint,
            dewPoint: roundedDewPoint,
        };
    if (score >= 60)
        return {
            level: 'good',
            text: '良好',
            issues,
            score,
            penalties,
            airQualityHint,
            dewPoint: roundedDewPoint,
        };
    if (score >= 40)
        return {
            level: 'fair',
            text: '尚可',
            issues,
            score,
            penalties,
            airQualityHint,
            dewPoint: roundedDewPoint,
        };
    return {
        level: 'poor',
        text: '不佳',
        issues,
        score,
        penalties,
        airQualityHint,
        dewPoint: roundedDewPoint,
    };
};

// PM2.5 官方對照表（EPA / 台灣 moenv 標準），供 UI 門檻與評分共用同一份數字來源
export const PM25_BREAKPOINTS = {
    good: 12, // ≤12.0 良好（AQI 0-50）
    moderate: 35.4, // ≤35.4 普通（AQI 51-100）
    sensitiveUnhealthy: 55.4, // ≤55.4 對敏感族群不健康（AQI 101-150）
    unhealthy: 150.4, // ≤150.4 對所有族群不健康（AQI 151-200）
    veryUnhealthy: 250.4, // ≤250.4 非常不健康（AQI 201-300）
} as const;

// 從一組分數中找出「最佳時段」的索引（同分取最早的時段）
export const pickBestSlotIndex = (scores: number[]): number => {
    if (scores.length === 0) return -1;
    let bestIndex = 0;
    for (let i = 1; i < scores.length; i += 1) {
        if (scores[i] > scores[bestIndex]) bestIndex = i;
    }
    return bestIndex;
};
