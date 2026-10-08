"""樂活報名網：signup.lohasnet.tw 的 JSON 清單 + 每場活動網站。"""
from datetime import date

from .fetch import get, text_of

NAME = "lohasnet"
SKIP_TYPES = {"4", "10"}  # 4 = 志工招募、10 = 線上路跑


def items(today: date):
    for g in get("https://signup.lohasnet.tw/lohasnet/index").json()["gamelist"]:
        if g["PjType"] in SKIP_TYPES or g["PjDate"] < today.isoformat():
            continue
        url = "https://lohasnet.tw/" + g["PjPath"].removeprefix("./")
        try:
            detail = text_of(get(url).text)
        except Exception as e:
            print(f"[lohasnet] 內頁抓取失敗 {url}: {e}")
            detail = ""
        yield {
            "source_id": g["PjNo"],
            "signup_url": url,
            "image_url": "https://lohasnet.tw/" + g["img"].lstrip("./") if g.get("img") else None,
            "text": "\n".join([
                f"賽事名稱：{g['PjName']}",
                f"日期：{g['PjDate']}",
                f"縣市：{g['PjCity']}",
                f"項目：{g['PjCategory']}",
                f"報名期間：{g['PjStartDate'][:10]} ~ {g['PjEndDate'][:10]}",
                detail,
            ]),
        }
