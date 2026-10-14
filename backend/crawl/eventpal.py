"""活動咖 EventPal：eventpal.com.tw 搜尋頁的賽事清單 + 每場活動頁（簡章和報名在同一頁）。

清單裡大多是常年開放的「【線上騎】」線上賽和公告，實體賽事一年只有幾場（梅山 36 彎等）。
"""
import re
import sys
from datetime import date
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .fetch import get, text_of

NAME = "eventpal"
BASE = "https://www.eventpal.com.tw/FOAS/actions/"
SKIP_WORDS = ("線上", "公告")  # 【線上騎】線上賽、【重要公告】網站公告


def parse(html: str, today: date):
    # ponytail: 只看搜尋頁第一頁（日期新到舊 10 場，2026-10 第二頁已是去年的賽事）；
    # 實體賽事多到擠出第一頁時會漏收，到時改用「看更多賽事」的 Search.action?queryActivity&moreCount= 分頁
    for card in BeautifulSoup(html, "html.parser").select(".actItem"):
        a = card.select_one("h3.title a[href]")
        day = card.select_one('meta[itemprop="startDate"]')
        seq = a and re.search(r"activityseqno=([\w-]+)", a["href"])
        name = a.get("title") or a.get_text(strip=True) if a else ""
        label = card.select_one(".label")
        if (not seq or not day or day["content"][:10] < today.isoformat() or any(w in name for w in SKIP_WORDS)
                or (label and "finish" in label.get("class", []))):
            continue
        img = card.select_one("img.image[src]")
        place = card.select_one(".location .text")
        deadline = card.select_one(".signup .text")
        yield {
            "source_id": seq[1],
            "signup_url": BASE + f"ActivityIndex.action?activitytab.activityseqno={seq[1]}",
            "image_url": urljoin("https://www.eventpal.com.tw/", img["src"]) if img else None,
            "text": "\n".join([
                f"賽事名稱：{name}",
                f"日期：{day['content'][:10]}",
                f"報名截止：{deadline.get_text(strip=True) if deadline else ''}",
                f"集合地點：{place.get_text(strip=True) if place else ''}",
            ]),
        }


def items(today: date):
    for it in parse(get(BASE + "Search.action?query").text, today):
        try:
            box = BeautifulSoup(get(it["signup_url"]).text, "html.parser").select_one(".innerContent")
            it["text"] += "\n" + (text_of(str(box)) if box else "")
        except Exception as e:  # 單頁失敗不影響其他場，下次爬蟲會重試
            print(f"[eventpal] 活動頁抓取失敗 {it['signup_url']}: {e!r}", file=sys.stderr)
        yield it
