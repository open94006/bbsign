import * as SunCalc from 'suncalc';

export const getSunTimes = (lat: number, lon: number, date: Date = new Date()) => {
    const times = SunCalc.getTimes(date, lat, lon);
    return { sunrise: times.sunrise, sunset: times.sunset };
};
