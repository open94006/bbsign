import { describe, expect, it } from 'vitest';
import { getAqiBand, getCompassDirection } from './runnerAdvice';

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

describe('getAqiBand - 環境部 AQI 六級', () => {
    it('級距上限歸在該級', () => {
        expect(getAqiBand(50).index).toBe(0);
        expect(getAqiBand(51).index).toBe(1);
        expect(getAqiBand(150).index).toBe(2);
        expect(getAqiBand(301).index).toBe(5);
    });

    it('刻度位置：每級各佔 1/6，超過 500 停在最右', () => {
        expect(getAqiBand(0).position).toBe(0);
        expect(getAqiBand(25).position).toBeCloseTo(1 / 12);
        expect(getAqiBand(100).position).toBeCloseTo(2 / 6);
        expect(getAqiBand(250).position).toBeCloseTo(4.5 / 6);
        expect(getAqiBand(800).position).toBe(1);
    });
});
