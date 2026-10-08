"""筆記報名：/list 賽事清單 + 每場內頁。清單含海外賽，交給正規化時用縣市濾掉。"""
import re
from datetime import date
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .fetch import get, text_of

NAME = "biji"
BASE = "https://irunner.biji.co/"


def items(today: date):
    listing = BeautifulSoup(get(BASE + "list").text, "html.parser")
    for row in listing.select(".competition-list-row:not(.list-title)"):
        a = row.select_one(".competition-name a")
        m = re.match(r"(\d{1,2})-(\d{1,2})", row.select_one(".competition-date").get_text(strip=True))
        if not a or not m or date(int(row["data-year"]), int(m[1]), int(m[2])) < today:
            continue
        url = urljoin(BASE, a["href"])
        page = BeautifulSoup(get(url).text, "html.parser")
        detail = page.select_one(".comp-detail")
        og = page.select_one('meta[property="og:image"]')
        cells = (row.select_one(f".competition-{k}") for k in ("date", "place", "event", "status"))
        yield {
            "source_id": a["href"].strip("/"),
            "signup_url": url,
            "image_url": og.get("content") if og else None,
            "text": "\n".join([
                f"賽事名稱：{a.get_text(strip=True)}",
                f"年份：{row['data-year']}",
                *(c.get_text(" ", strip=True) for c in cells if c),
                text_of(str(detail)) if detail else "",
            ]),
        }
