"""中華民國路跑協會：年度賽程表（今年＋明年）。"""
import re
from datetime import date
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .fetch import get, text_of

NAME = "sportsnet"
BASE = "https://www.sportsnet.org.tw"


def items(today: date):
    home = BeautifulSoup(get(f"{BASE}/").text, "html.parser")
    # 只有首頁輪播的熱門賽事有主視覺，用連結對回賽程表
    banners = {
        a["href"].strip().rstrip("/"): urljoin(f"{BASE}/", a.img["src"])
        for a in home.select("a[href]")
        if a.img and "banner" in a.img.get("src", "")
    }
    for year in (today.year, today.year + 1):
        page = BeautifulSoup(get(f"{BASE}/schedule.php?schedule_year={year}").text, "html.parser")
        for tr in page.select("table.races tr"):
            tds = tr.find_all("td")
            if len(tds) < 6:
                continue
            no, when, name, place, cat = (td.get_text(" ", strip=True) for td in tds[1:6])
            m = re.match(r"(\d{1,2})/(\d{1,2})", when)
            if not m or date(year, int(m[1]), int(m[2])) < today:
                continue
            a = tds[3].find("a")
            url = a["href"].strip() if a else f"{BASE}/schedule.php?schedule_year={year}"
            text = f"賽事名稱：{name}\n日期：{year}年 {when}\n地點：{place}\n項目：{cat}"
            # ponytail: 只多抓路協自家網站上的賽事頁，外部官網不抓
            if url.startswith(BASE) and a:
                try:
                    text += "\n" + text_of(get(url).text)
                except Exception as e:
                    print(f"[sportsnet] 內頁抓取失敗 {url}: {e}")
            yield {"source_id": f"{year}-{no}", "signup_url": url, "image_url": banners.get(url.rstrip("/")), "text": text}
