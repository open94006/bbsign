"""跑步天氣的自我檢查（在 backend/ 底下執行：python test_weather.py）。

- 一律跑：缺值處理、最近測站、台灣範圍、AQI 換算、縣市白名單、預報時間對應
- 上游實測含鄉鎮：指定鄉鎮、不合法鄉鎮退回縣市政府所在地、鄉鎮一週預報
- 有 CWA_API_KEY、MOENV_API_KEY：實際打上游，確認欄位都還在
"""
import os
from datetime import datetime, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient

import weather
from weather import TW

client = TestClient(FastAPI(routes=weather.router.routes))


def check_pure() -> None:
    assert weather.num("-99") is None and weather.num("") is None and weather.num("-") is None and weather.num("nan") is None
    assert weather.num("27.5") == 27.5 and weather.num("-3") == -3
    assert weather.kmh(5) == 18 and weather.kmh(None) is None
    assert [weather.aqi_level(a) for a in (0, 50, 51, 100, 150, 200, 201, 400)] == [1, 1, 2, 2, 3, 4, 5, 5]
    assert weather.in_taiwan(25.04, 121.56) and weather.in_taiwan(24.44, 118.32) and weather.in_taiwan(26.37, 120.49)  # 臺北、金門、東引
    assert not weather.in_taiwan(35.68, 139.69) and not weather.in_taiwan(float("nan"), 121)
    pts = [{"lat": 25.0, "lon": 121.5, "n": "近"}, {"lat": 24.0, "lon": 121.5, "n": "遠"}]
    assert weather.nearest(pts, 25.1, 121.5)["n"] == "近" and weather.nearest([], 25, 121) is None

    t0 = datetime(2026, 10, 11, 12, tzinfo=TW)
    f = {
        "點": [{"start": (t0 + timedelta(hours=h)).isoformat(), "end": None, "v": h} for h in range(3)],
        "段": [{"start": (t0 + timedelta(hours=h)).isoformat(), "end": (t0 + timedelta(hours=h + 3)).isoformat(), "v": h} for h in (0, 3)],
    }
    assert weather.pick(f, "點", "v", t0 + timedelta(minutes=90)) == 1, "時間點資料取之前最後一筆"
    assert weather.pick(f, "點", "v", t0 - timedelta(hours=1)) is None
    assert weather.pick(f, "段", "v", t0 + timedelta(hours=3)) == 3, "區間是 [start, end)"
    assert weather.pick(f, "段", "v", t0 + timedelta(hours=7)) is None
    assert weather.pick(f, "沒有", "v", t0) is None

    ts = [{"name": n} for n in ("苓雅區", "新興區", "東區", "大安區", "臺東市")]
    town = lambda text: (weather.town_in(ts, text) or {}).get("name")  # noqa: E731
    assert town("高雄市苓雅運動園區田徑場") == "苓雅區", "沒寫「區」也要認得"
    assert town("新興區中正路，終點苓雅區") == "新興區", "取最早出現的"
    assert town("台東市體育場") == "臺東市"
    assert town("園區東側") is None, "一個字的名稱不比對（東區→東）"


def check_validation() -> None:
    assert client.get("/api/weather").status_code == 400
    assert client.get("/api/weather", params={"lat": 35.68, "lon": 139.69}).status_code == 400, "台灣以外要擋"
    assert client.get("/api/weather", params={"lat": "nan", "lon": 121}).status_code in (400, 422)
    assert client.get("/api/weather", params={"county": "東京都"}).status_code == 400
    assert client.get("/api/weather/week", params={"county": "台北市"}).status_code == 400, "只收「臺」"
    assert client.get("/api/weather/week").status_code == 422


def check_live() -> None:
    r = client.get("/api/weather", params={"county": "臺北市"})
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("temperature", "humidity", "windSpeed", "feelsLike", "description"):
        assert d[k] is not None, f"缺 {k}"
    assert d["city"] == "臺北市" and d["town"] in d["towns"] and len(d["temperatureTrend6h"]) == 6
    assert all(s["temperature"] is not None for s in d["temperatureTrend6h"]), "6 小時趨勢缺溫度"
    assert d["airQuality"] and 1 <= d["airQuality"]["aqi"] <= 5

    r = client.get("/api/weather", params={"lat": 24.44, "lon": 118.32})  # 金門
    assert r.status_code == 200 and r.json()["city"] == "金門縣", r.text
    r = client.get("/api/weather", params={"county": "高雄市", "town": "鳳山區"})
    assert r.status_code == 200 and r.json()["location"] == "高雄市鳳山區", r.text
    r = client.get("/api/weather", params={"county": "高雄市", "town": "不存在區"})
    assert r.status_code == 200 and r.json()["town"] in r.json()["towns"], "不在白名單的鄉鎮要退回縣市政府所在地"

    wk = client.get("/api/weather/week", params={"county": "臺南市", "town": "新營區"}).json()
    assert wk["town"] == "新營區", wk
    wk = client.get("/api/weather/week", params={"county": "高雄市", "venue": "苓雅運動園區田徑場"}).json()
    assert wk["town"] == "苓雅區", wk
    assert client.get("/api/weather/week", params={"county": "高雄市", "venue": "長" * 201}).status_code == 422
    w = client.get("/api/weather/week", params={"county": "澎湖縣"}).json()["periods"]
    assert len(w) >= 13, len(w)
    assert all(p["maxTemp"] is not None for p in w), "每段都要有最高溫"
    assert all(p["precipitationProbability"] is not None for p in w[:5]), "前 3 天要有降雨機率（第 4 天起 CWA 給「-」）"
    assert any(p["uvIndex"] is not None for p in w), "一週預報應有 UV"
    print("  臺北市", d["station"], d["temperature"], "°C，AQI", d["airQuality"]["aqiValue"], "，3 小時後", d["temperatureTrend6h"][2]["temperature"], "°C")


if __name__ == "__main__":
    check_pure()
    check_validation()
    print("✓ 離線檢查")
    if os.getenv("CWA_API_KEY") and os.getenv("MOENV_API_KEY"):
        check_live()
        print("✓ 上游實測")
    else:
        print("- 沒有 CWA_API_KEY / MOENV_API_KEY，略過上游實測")
