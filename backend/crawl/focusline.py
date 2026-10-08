"""眾點資訊：/api/act JSON 清單 + 活動簡章 API。"""
import json
from datetime import date

from .fetch import get, text_of

NAME = "focusline"
API = "https://www.focusline.com.tw/api"
# 清單裡還有籃球、料理比賽、晚宴等，只留跑步、自行車、三鐵
KEEP = ("路跑", "馬拉松", "自行車", "鐵人", "越野")


def items(today: date):
    for act in get(f"{API}/act").json():
        if act["actDate"][:10] < today.isoformat() or not any(k in act["category"] for k in KEEP):
            continue
        code = act["actCode"]
        detail = ""
        try:
            menu = get(f"{API}/Menubar/{code}").json()
            cid = next((m["htmlContentId"] for m in menu if m["name"] == "活動簡章"), None)
            if cid:
                detail = text_of(get(f"{API}/PageContent/{code}/{cid}").json()["content"])
        except Exception as e:
            print(f"[focusline] 簡章抓取失敗 {code}: {e}")
        cities = json.loads(act["geo"] or "{}").get("cities", [])
        yield {
            "source_id": code,
            "signup_url": f"https://www.focusline.com.tw/{code}",
            "image_url": (act.get("banner") or {}).get("web"),
            "text": "\n".join([
                f"賽事名稱：{act['actName']}",
                f"類別：{act['category']}",
                f"日期：{act['actDate'][:10]}",
                f"縣市：{'、'.join(cities)}",
                f"地點：{act['location']}",
                f"報名期間：{act['register']['start'][:10]} ~ {act['register']['end'][:10]}",
                detail,
            ]),
        }
