import { describe, expect, it } from 'vitest';
import { getClothingAdvice, getCompassDirection, getHydrationAdvice } from './runnerAdvice';

describe('getCompassDirection - 風向轉 16 方位', () => {
    it('0 度為北', () => {
        expect(getCompassDirection(0)).toBe('北');
    });

    it('90 度為東', () => {
        expect(getCompassDirection(90)).toBe('東');
    });

    it('180 度為南', () => {
        expect(getCompassDirection(180)).toBe('南');
    });

    it('270 度為西', () => {
        expect(getCompassDirection(270)).toBe('西');
    });

    it('45 度為東北', () => {
        expect(getCompassDirection(45)).toBe('東北');
    });

    it('360 度應等同 0 度（北）', () => {
        expect(getCompassDirection(360)).toBe('北');
    });

    it('負角度應正確 wrap（-10 度接近北）', () => {
        expect(getCompassDirection(-10)).toBe('北');
    });
});

describe('getClothingAdvice - 穿著建議（穿得比體感冷 10°C 原則）', () => {
    it('體感 > 25°C 建議背心短褲', () => {
        expect(getClothingAdvice(28).title).toBe('背心 + 短褲');
    });

    it('體感 15-25°C 建議短袖', () => {
        expect(getClothingAdvice(20).title).toBe('短袖 + 短褲');
    });

    it('體感 5-15°C 建議長袖薄外套', () => {
        expect(getClothingAdvice(10).title).toBe('長袖薄外套');
    });

    it('體感 < 5°C 建議保暖層+手套', () => {
        expect(getClothingAdvice(2).title).toBe('保暖層 + 手套');
    });
});

describe('getHydrationAdvice - 補水量建議', () => {
    it('舒適天氣跑 60 分鐘，建議 400-500 ml', () => {
        const result = getHydrationAdvice(20, 10, 60);
        expect(result.minMl).toBe(400);
        expect(result.maxMl).toBe(500);
    });

    it('嚴重悶熱跑 60 分鐘，建議量應高於舒適天氣', () => {
        const comfortable = getHydrationAdvice(20, 10, 60);
        const severe = getHydrationAdvice(32, 26, 60);
        expect(severe.minMl).toBeGreaterThan(comfortable.minMl);
    });

    it('時長加倍，建議量也應等比放大', () => {
        const result30 = getHydrationAdvice(20, 10, 30);
        const result60 = getHydrationAdvice(20, 10, 60);
        expect(result60.minMl).toBe(result30.minMl * 2);
    });
});
