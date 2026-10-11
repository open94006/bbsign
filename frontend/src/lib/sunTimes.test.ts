import { describe, expect, it } from 'vitest';
import { getSunTimes } from './sunTimes';

describe('getSunTimes - 日出日落計算', () => {
    it('台北座標在夏至前後，日出應早於日落', () => {
        const { sunrise, sunset } = getSunTimes(25.033, 121.5654, new Date('2026-06-21T04:00:00Z'));
        expect(sunrise).not.toBeNull();
        expect(sunset).not.toBeNull();
        expect(sunrise!.getTime()).toBeLessThan(sunset!.getTime());
    });

    it('台灣緯度不會出現極晝/極夜，回傳應為有效的 Date 物件', () => {
        const { sunrise, sunset } = getSunTimes(25.033, 121.5654);
        expect(sunrise).not.toBeNull();
        expect(sunset).not.toBeNull();
        expect(Number.isNaN(sunrise!.getTime())).toBe(false);
        expect(Number.isNaN(sunset!.getTime())).toBe(false);
    });
});
