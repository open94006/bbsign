"""全統運動：首頁卡片 + 每場的「活動簡章」分頁。"""
import re
from datetime import date

from bs4 import BeautifulSoup

from .fetch import get, text_of

NAME = "ctrun"
BASE = "https://www.ctrun.com.tw"


def items(today: date):
    home = BeautifulSoup(get(BASE + "/").text, "html.parser")
    for card in home.select("[id^=eventId_]"):
        eid = card["id"].removeprefix("eventId_")
        lines = [li.get_text(" ", strip=True) for li in card.find_all("li")]
        m = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日", " ".join(lines))
        if m and date(*map(int, m.groups())) < today:
            continue
        url = f"{BASE}/Activity/?EventMain_ID={eid}"
        page = get(url).text
        # 分頁連結長這樣：onclick="SideBarLink(331,6708)">活動簡章
        art = re.search(r"SideBarLink\(\d+,(\d+)\)\">\s*活動簡章", page)
        if art:
            page = get(f"{url}&Article_ID={art[1]}").text
        main = BeautifulSoup(page, "html.parser").find(id="mainContent")
        title = " ".join(t.get_text(strip=True) for t in (card.h6, card.h4) if t)
        img = card.select_one("img[data-src]")
        yield {
            "source_id": eid,
            "signup_url": url,
            "image_url": img["data-src"] if img else None,
            "text": "\n".join([f"賽事名稱：{title}", *lines, text_of(str(main or page))]),
        }
