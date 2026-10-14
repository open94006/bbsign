"""SporTaiwan（影流文創）：sportaiwan.com 活動列表 + 每場活動簡章。

同一家公司的 Photou（photou.com.tw）列的是同一批賽事，只爬這邊。
列表上的報名費區間常是錯的（已截止的活動都顯示同一個區間），交給 AI 從簡章的組別表讀。
"""
import re
import sys
from datetime import date

from bs4 import BeautifulSoup

from .fetch import get, text_of

NAME = "sportaiwan"
BASE = "https://sportaiwan.com/activity/"


def parse(html: str, today: date):
    """列表上半是報名中的活動，下半 .finish_activity 是已截止的，只取上半。"""
    page = BeautifulSoup(html, "html.parser")
    for li in page.select(".spor_main_azone:not(.finish_activity) li"):
        for star in li.select(".spor_mstar"):  # 「0 評價」夾在活動地點那行
            star.decompose()
        a = li.select_one(".spor_m_title a[href]")
        aid = a and re.search(r"id=(\d+)", a["href"])
        lines = [d.get_text(" ", strip=True) for d in li.select(".spor_m_time")]
        day = next((m[1] for t in lines if (m := re.search(r"活動日期：(\d{4}-\d\d-\d\d)", t))), None)
        if not aid or not day or date.fromisoformat(day) < today:
            continue
        img = li.select_one(".spor_m_photo img[src]")
        yield {
            "source_id": aid[1],
            "signup_url": f"{BASE}activity_register.php?id={aid[1]}",
            "image_url": "https:" + img["src"].split("?")[0] if img and img["src"].startswith("//") else None,
            # 報名開始日未定時列表寫 0000.00.00
            "text": "\n".join([f"賽事名稱：{a.get_text(' ', strip=True)}",
                               *(t.replace("0000.00.00", "未公布") for t in lines)]),
        }


def items(today: date):
    for it in parse(get(BASE + "activity_list.php").text, today):
        url = f"{BASE}activity_desc.php?activity={it['source_id']}"
        try:
            zone = BeautifulSoup(get(url).text, "html.parser").select_one(".activity_desc_zone")
            it["text"] += "\n" + (text_of(str(zone)) if zone else "")
        except Exception as e:  # 單頁失敗不影響其他場，下次爬蟲會重試
            print(f"[sportaiwan] 簡章抓取失敗 {url}: {e}", file=sys.stderr)
        yield it
