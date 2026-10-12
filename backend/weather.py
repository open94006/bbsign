"""跑步天氣：代理中央氣象署（CWA）與環境部（MOENV）開放資料，只做台灣。

上游只打固定網址：測站與空品整包快取，預報依縣市（白名單）快取。
使用者的座標只用來在快取裡挑最近的測站，流量再大，上游呼叫次數也固定。
"""
import json
import math
import os
import ssl
from datetime import datetime, timedelta, timezone

import certifi
import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

import db

TW = timezone(timedelta(hours=8))  # 台灣沒有日光節約，不需要 zoneinfo
CWA = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/"
MOENV = "https://data.moenv.gov.tw/api/v2/aqx_p_432"
HEADERS = {"Cache-Control": "public, max-age=300"}

# Python 3.13 預設 VERIFY_X509_STRICT，CWA、MOENV 的政府憑證缺 Subject Key Identifier 會被擋。
# 只清掉 strict 旗標：過期、主機名稱不符、自簽憑證仍會被拒。不要改成 verify=False。
_tls = ssl.create_default_context(cafile=certifi.where())
_tls.verify_flags &= ~ssl.VERIFY_X509_STRICT
http = httpx.Client(verify=_tls, timeout=20)

# 縣市白名單：(縣市政府所在地緯度, 經度, 鄉鎮 3 天預報資料集編號)。只給縣市時用政府所在地挑最近的鄉鎮；
# 1 週預報的編號是 3 天的 +2（F-D0047-061 臺北市 3 天、-063 臺北市 1 週）
COUNTIES = {
    "臺北市": (25.04, 121.56, 61), "新北市": (25.01, 121.46, 69), "基隆市": (25.13, 121.74, 49), "桃園市": (24.99, 121.30, 5),
    "新竹市": (24.81, 120.97, 53), "新竹縣": (24.83, 121.01, 9), "苗栗縣": (24.56, 120.82, 13), "臺中市": (24.16, 120.65, 73),
    "彰化縣": (24.08, 120.54, 17), "南投縣": (23.90, 120.69, 21), "雲林縣": (23.70, 120.53, 25), "嘉義市": (23.48, 120.45, 57),
    "嘉義縣": (23.46, 120.29, 29), "臺南市": (22.99, 120.19, 77), "高雄市": (22.62, 120.31, 65), "屏東縣": (22.68, 120.49, 33),
    "宜蘭縣": (24.73, 121.76, 1), "花蓮縣": (23.99, 121.61, 41), "臺東縣": (22.76, 121.15, 37), "澎湖縣": (23.57, 119.58, 45),
    "金門縣": (24.44, 118.32, 85), "連江縣": (26.16, 119.95, 81),
}

router = APIRouter()


def cached(key: str, ttl: int, fetch):
    if db.cache and (hit := db.cache.get(key)):
        return json.loads(hit)
    try:
        data = fetch()
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as e:
        # MOENV 金鑰在網址參數裡，只記例外類型與狀態碼，不記訊息（訊息會帶網址）
        status = e.response.status_code if isinstance(e, httpx.HTTPStatusError) else ""
        print(f"天氣上游錯誤 {key}：{type(e).__name__} {status}")
        raise HTTPException(503, "天氣資料暫時無法取得，請稍後再試") from None
    if db.cache:
        db.cache.set(key, json.dumps(data, ensure_ascii=False), ex=ttl)
    return data


def num(v) -> float | None:
    """上游的數值欄位都是字串；缺值是 -99、空字串或「-」。"""
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return None if x <= -90 or math.isnan(x) else x


def kmh(ms: float | None) -> int | None:
    return None if ms is None else round(ms * 3.6)  # runningCondition.ts 的風速門檻是 km/h


def aqi_level(aqi: float) -> int:
    # runningCondition.ts 吃 OWM 的 1–5 級，沿用 z-running 的換算
    return 1 if aqi <= 50 else 2 if aqi <= 100 else 3 if aqi <= 150 else 4 if aqi <= 200 else 5


def in_taiwan(lat: float, lon: float) -> bool:
    return 21.5 <= lat <= 26.5 and 118.0 <= lon <= 122.5  # 含澎金馬；NaN 的比較一律 False，也會被擋


def nearest(rows: list[dict], lat: float, lon: float) -> dict | None:
    # ponytail: 等距圓柱投影近似，台灣範圍內挑最近的點夠準，不用 haversine
    k = math.cos(math.radians(lat))
    return min(rows, key=lambda r: (r["lat"] - lat) ** 2 + ((r["lon"] - lon) * k) ** 2, default=None)


def cwa(dataset: str, **params) -> dict:
    r = http.get(CWA + dataset, params={"format": "JSON", **params},
                 headers={"Authorization": os.environ.get("CWA_API_KEY", "")})
    r.raise_for_status()
    return r.json()["records"]


def stations() -> list[dict]:
    def fetch():
        out = []
        for s in cwa("O-A0001-001")["Station"]:
            g, w = s["GeoInfo"], s["WeatherElement"]
            c = {c["CoordinateName"]: c for c in g["Coordinates"]}.get("WGS84")
            if not c:
                continue
            out.append({
                "name": s["StationName"], "county": g["CountyName"], "town": g["TownName"],
                "lat": float(c["StationLatitude"]), "lon": float(c["StationLongitude"]), "time": s["ObsTime"]["DateTime"],
                "weather": w.get("Weather") if w.get("Weather") not in (None, "", "-99") else None,
                "temp": num(w.get("AirTemperature")), "humidity": num(w.get("RelativeHumidity")),
                "wind": num(w.get("WindSpeed")), "windDeg": num(w.get("WindDirection")), "pressure": num(w.get("AirPressure")),
            })
        return out
    return cached("bb:wx:obs", 600, fetch)


def air_sites() -> list[dict]:
    def fetch():
        r = http.get(MOENV, params={"api_key": os.environ.get("MOENV_API_KEY", ""), "limit": 1000, "format": "JSON"})
        r.raise_for_status()
        rows = [{"name": x["sitename"], "lat": num(x["latitude"]), "lon": num(x["longitude"]), "aqi": num(x["aqi"]),
                 "status": x["status"], "pm2_5": num(x["pm2.5"]), "pm10": num(x["pm10"]), "o3": num(x["o3"]),
                 "pollutant": x.get("pollutant") or None} for x in r.json()]
        return [x for x in rows if None not in (x["lat"], x["lon"], x["aqi"])]
    return cached("bb:wx:aqi", 1200, fetch)


def dataset(county: str, week: bool) -> str:
    return f"F-D0047-{COUNTIES[county][2] + (2 if week else 0):03d}"


def towns(county: str) -> list[dict]:
    """縣市的鄉鎮清單與座標：只抓一個元素，整個縣市也才幾十 KB；鄉鎮很少變，一天更新一次。"""
    def fetch():
        locs = cwa(dataset(county, True), ElementName="最高溫度")["Locations"][0]["Location"]
        return [{"name": x["LocationName"], "lat": float(x["Latitude"]), "lon": float(x["Longitude"])} for x in locs]
    return cached(f"bb:wx:towns:{county}", 86400, fetch)


def forecast(county: str, town: str, week: bool) -> dict[str, list[dict]]:
    """單一鄉鎮的預報 {元素名稱: [{start, end, ...ElementValue}]}；時間點資料（DataTime）的 end 是 None。
    town 必須先經過 towns() 白名單。整個縣市一次抓最大 1.7 MB（高雄），所以依鄉鎮分開抓、分開快取。"""
    def fetch():
        loc = cwa(dataset(county, week), LocationName=town)["Locations"][0]["Location"][0]
        return {e["ElementName"]: [{"start": t.get("StartTime") or t["DataTime"], "end": t.get("EndTime"), **t["ElementValue"][0]}
                                   for t in e["Time"]] for e in loc["WeatherElement"]}
    return cached(f"bb:wx:{'week' if week else '3d'}:{county}:{town}", 3600 if week else 1800, fetch)


def town_in(ts: list[dict], text: str) -> dict | None:
    """從賽事地點文字找鄉鎮：先找完整名稱（苓雅區），再找去掉區鄉鎮市的名稱（「苓雅運動園區」的苓雅）；
    同時符合好幾個時取最早出現的。只比對這個縣市真的有的鄉鎮。"""
    text = text.replace("台", "臺")
    for names in ([t["name"] for t in ts], [t["name"][:-1] if len(t["name"]) > 2 else "" for t in ts]):
        found = [(text.find(n), t) for n, t in zip(names, ts) if n and n in text]
        if found:
            return min(found, key=lambda x: x[0])[1]
    return None


def place(county: str, town: str | None, lat: float | None = None, lon: float | None = None, venue: str | None = None) -> dict:
    """決定要看哪個鄉鎮：town 在白名單就用它；否則從 venue 文字找；都沒有就挑離 (lat, lon) 最近的鄉鎮
    （沒給座標就用縣市政府所在地）。"""
    ts = towns(county)
    hit = next((t for t in ts if t["name"] == town), None) or (venue and town_in(ts, venue))
    if hit:
        return hit
    seat = COUNTIES[county]
    found = nearest(ts, lat if lat is not None else seat[0], lon if lon is not None else seat[1])
    if not found:
        raise HTTPException(503, "天氣資料暫時無法取得，請稍後再試")
    return found


def pick(f: dict, element: str, field: str, t: datetime):
    """時間 t 的值：區間資料取涵蓋 t 的那段，時間點資料取 t 之前最後一筆。"""
    hit = None
    for x in f.get(element, []):
        start = datetime.fromisoformat(x["start"])
        if x["end"]:
            if start <= t < datetime.fromisoformat(x["end"]):
                return x.get(field)
        elif start <= t:
            hit = x.get(field)
    return hit


def check_county(county: str) -> None:
    if county not in COUNTIES:
        raise HTTPException(400, "不支援的縣市")


@router.get("/api/weather")
def current(lat: float | None = None, lon: float | None = None, county: str | None = None, town: str | None = None):
    # 先驗證參數，不合法的請求不碰上游
    if county is not None:
        check_county(county)
    elif lat is None or lon is None or not in_taiwan(lat, lon):
        raise HTTPException(400, "請提供台灣範圍內的經緯度或縣市")

    obs = [s for s in stations() if None not in (s["temp"], s["humidity"], s["wind"])]
    if county is not None:
        area = place(county, town)
        lat, lon = area["lat"], area["lon"]
    else:
        # 定位：用最近測站判斷縣市，再挑縣市內最近的鄉鎮
        st = nearest(obs, lat, lon)
        if not st or st["county"] not in COUNTIES:
            raise HTTPException(503, "天氣資料暫時無法取得，請稍後再試")
        county = st["county"]
        area = place(county, None, lat, lon)

    st = nearest(obs, lat, lon)
    if not st:
        raise HTTPException(503, "天氣資料暫時無法取得，請稍後再試")
    f3, week = forecast(county, area["name"], False), forecast(county, area["name"], True)
    air = nearest(air_sites(), lat, lon)
    now = datetime.now(TW)

    def slot(t: datetime) -> dict:
        return {
            "time": t.isoformat(),
            "temperature": num(pick(f3, "溫度", "Temperature", t)),
            "feelsLike": num(pick(f3, "體感溫度", "ApparentTemperature", t)),
            "humidity": num(pick(f3, "相對濕度", "RelativeHumidity", t)),
            "windSpeed": kmh(num(pick(f3, "風速", "WindSpeed", t))),
            "precipitationProbability": num(pick(f3, "3小時降雨機率", "ProbabilityOfPrecipitation", t)),
            "description": pick(f3, "天氣現象", "Weather", t),
            "weatherCode": pick(f3, "天氣現象", "WeatherCode", t),
        }

    hour = now.replace(minute=0, second=0, microsecond=0)
    trend = [slot(hour + timedelta(hours=h)) for h in range(1, 7)]
    # 預報剛發布時第一筆從下一個整點開始，「現在」查不到就用下一個整點的值
    soon = lambda key, value: trend[0][key] if value is None else value  # noqa: E731
    return JSONResponse({
        "location": county + area["name"],
        "city": county,
        "town": area["name"],
        "towns": [t["name"] for t in towns(county)],  # 前端的鄉鎮選單
        "station": st["name"],
        "lat": area["lat"],  # 鄉鎮座標，前端算日出日落用
        "lon": area["lon"],
        "temperature": st["temp"],
        "humidity": st["humidity"],
        "windSpeed": kmh(st["wind"]),
        "windDeg": st["windDeg"],
        "pressure": st["pressure"],
        "description": st["weather"] or soon("description", pick(f3, "天氣現象", "Weather", now)),
        "weatherCode": soon("weatherCode", pick(f3, "天氣現象", "WeatherCode", now)),
        "feelsLike": soon("feelsLike", num(pick(f3, "體感溫度", "ApparentTemperature", now))),
        "precipitationProbability": soon("precipitationProbability", num(pick(f3, "3小時降雨機率", "ProbabilityOfPrecipitation", now))),
        "uvIndex": num(pick(week, "紫外線指數", "UVIndex", now)),
        "uvLevel": pick(week, "紫外線指數", "UVExposureLevel", now),
        "temperatureTrend6h": trend,
        "airQuality": air and {
            "aqi": aqi_level(air["aqi"]), "aqiValue": air["aqi"], "description": air["status"], "station": air["name"],
            "components": {"pm2_5": air["pm2_5"], "pm10": air["pm10"], "o3": air["o3"]},
            "pollutant": air.get("pollutant"),  # 主要污染物；AQI ≤ 50 時環境部給空字串。get：部署後快取裡還有舊資料
        },
        "timestamp": st["time"],
        "source": "中央氣象署、環境部",
    }, headers=HEADERS)


@router.get("/api/weather/week")
def week(county: str, town: str | None = None, venue: str | None = Query(None, max_length=200)):
    check_county(county)
    area = place(county, town, venue=venue)
    f = forecast(county, area["name"], True)
    periods = []
    for x in f.get("天氣現象", []):
        t = datetime.fromisoformat(x["start"])
        periods.append({
            "start": x["start"], "end": x["end"], "description": x.get("Weather"), "weatherCode": x.get("WeatherCode"),
            "maxTemp": num(pick(f, "最高溫度", "MaxTemperature", t)),
            "minTemp": num(pick(f, "最低溫度", "MinTemperature", t)),
            "maxFeelsLike": num(pick(f, "最高體感溫度", "MaxApparentTemperature", t)),
            "minFeelsLike": num(pick(f, "最低體感溫度", "MinApparentTemperature", t)),
            "humidity": num(pick(f, "平均相對濕度", "RelativeHumidity", t)),
            "dewPoint": num(pick(f, "平均露點溫度", "DewPoint", t)),
            "windSpeed": kmh(num(pick(f, "風速", "WindSpeed", t))),
            "precipitationProbability": num(pick(f, "12小時降雨機率", "ProbabilityOfPrecipitation", t)),
            "uvIndex": num(pick(f, "紫外線指數", "UVIndex", t)),
        })
    return JSONResponse({"county": county, "town": area["name"], "periods": periods}, headers=HEADERS)
