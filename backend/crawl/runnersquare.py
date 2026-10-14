"""跑者廣場賽事行事曆：taipeimarathon.org.tw/contest.aspx 一頁列出所有賽事（只有 http）。

主要補伊貝特（擋程式存取）和零星小平台。只收還沒截止報名的；報名連結指向現有爬蟲的網域、
或資料庫裡別的來源已有相同報名網址，標成 covered 交給 run.py 略過。網址不同的同一場由 run.py 的 dedupe 處理。
沒有內頁可抓（伊貝特擋爬），AI 只拿清單列的名稱、日期、地點、組別、費用。
"""
import re
from datetime import date, timedelta
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

import db
from .bijical import COVERED
from .fetch import get

NAME = "runnersquare"
URL = "http://www.taipeimarathon.org.tw/contest.aspx"


def key(url: str) -> str:
    """比對用的網址：去掉 www、#片段、結尾斜線，不分大小寫（伊貝特同一場的 # 後面會不一樣）。"""
    u = urlsplit(url.strip())
    return (u.netloc.removeprefix("www.") + u.path.rstrip("/") + (f"?{u.query}" if u.query else "")).lower()


def race_day(m: int, d: int, today: date) -> date | None:
    """日期格沒有年份：比今天早超過半年的算明年，其餘早於今天的是還沒標成過去的舊賽事，不要。"""
    # ponytail: 半年門檻假設清單不會列一年半以後的賽事
    try:
        day = date(today.year, m, d)
        if day < today - timedelta(days=180):
            day = date(today.year + 1, m, d)
    except ValueError:  # 2/29 落在平年
        return None
    return day if day >= today else None


def parse(html: str, today: date):
    for tr in BeautifulSoup(html, "html.parser").select("tr"):
        if "oldactivity" in (tr.get("class") or []):
            continue
        tds, a = tr.find_all("td", recursive=False), tr.select_one("a[href]")
        m = len(tds) >= 8 and re.search(r"(\d{1,2})/(\d{1,2})", tds[3].get_text())
        if not m or not a or not a["href"].startswith("http"):
            continue
        status = tds[-1].get_text(strip=True)
        day = race_day(int(m[1]), int(m[2]), today)
        if not day or "已截止" in status:
            continue
        groups = "、".join(
            b.get_text(strip=True) + "".join(f" {k}{v}" for k, v in re.findall(r"(費用|限額)：\s*(\d+)", b.get("title", "")))
            for b in tds[5].select("button"))
        name = a.get_text(strip=True)
        yield {
            # 同一場分兩天會列兩次（名稱相同）→ 併成一筆；同一報名網址的不同賽事（IRONMAN／IRONKIDS）→ 分開
            "source_id": key(a["href"]) + "|" + re.sub(r"\s+", "", name),
            "signup_url": a["href"].strip(),
            "text": "\n".join([
                f"賽事名稱：{name}",
                f"日期：{day.isoformat()} {tds[3].get_text(' ', strip=True)}",
                f"地點：{tds[4].get_text(strip=True)}",
                f"組別：{groups}",
                f"主辦單位：{tds[6].get_text(strip=True)}",
                f"報名期間：{status}",
            ]),
        }


def known() -> set[str]:
    try:
        with db.connect() as c:
            rows = c.execute("select signup_url from events where source <> %s", (NAME,)).fetchall()
    except Exception:  # --dry 沒有資料庫：不去重
        rows = []
    return {key(r["signup_url"]) for r in rows}


def items(today: date):
    urls = known()
    for it in parse(get(URL).text, today):
        if urlsplit(it["signup_url"]).netloc.endswith(COVERED) or key(it["signup_url"]) in urls:
            yield {"source_id": it["source_id"], "covered": True}
        else:
            yield it
