"""routes.sql 自我檢查（python test_routes.py）：它在每次啟動時執行，JSON 寫壞網站就起不來。"""
import json
import re
from pathlib import Path

# 要和 main.py CSP 的 frame-src 一致，否則嵌入會被擋
ALLOWED = ("https://ridewithgps.com/embeds?", "https://connect.garmin.com/embed/course/")

sql = (Path(__file__).parent / "routes.sql").read_text()
blocks = re.findall(r"set routes = '(.*?)' where race_date = '\d{4}-\d{2}-\d{2}' and name like '%[^%']+%';", sql, re.S)
assert len(blocks) == sql.count("update events"), "每個 update 都要是「比賽日＋名稱關鍵字」的格式"
for block in blocks:
    routes = json.loads(block)
    assert routes and all(r["label"] and r["url"].startswith(ALLOWED) for r in routes), routes
    assert len({r["url"] for r in routes}) == len(routes), f"同一場有重複的路線：{routes}"
print(f"✓ routes.sql：{len(blocks)} 場、{sum(len(json.loads(b)) for b in blocks)} 條路線")
