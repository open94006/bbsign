"""中華民國自行車騎士協會：cyclist.org.tw 活動賽事列表 + 每場活動頁 + 簡章 PDF。

協會自己主辦，報名多半連到伊貝特（bao-ming.com），等於多一條拿到伊貝特報名網址的路。
活動頁通常只有「活動簡章【請按此】」，簡章內容（地點、組別、費用）都在 PDF 裡，所以要讀 PDF。
"""
import io
import re
import sys
from datetime import date, datetime
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from pypdf import PdfReader

from .fetch import get, text_of

NAME = "cyclist"
BASE = "https://www.cyclist.org.tw/"
SKIP_SERIES = {"線上虛擬騎乘"}


def race_day(li) -> date | None:
    # 日期被網站註解掉了：<!--<div class="date">7&nbsp;Nov.<strong>2026</strong></div>-->
    m = re.search(r'class="date">(\d{1,2})(?:&nbsp;|\s)+([A-Z][a-z]{2})\.?<strong>(\d{4})', str(li))
    return datetime.strptime(" ".join(m.groups()), "%d %b %Y").date() if m else None


def parse(html: str, today: date):
    seen = set()  # 國際賽另有英文版活動頁（2026Taiwan KOM Challenge），報名連到同一個伊貝特活動，只留先列的中文版
    for li in BeautifulSoup(html, "html.parser").select("#grid > li"):
        day = race_day(li)
        status = li.select_one(".entry-info .btn")
        series = li.select_one(".entry-meta")
        info = li.select_one('.entry-footer a[href*="pno="]')
        signup = next((a["href"] for a in li.select(".entry-footer a[href]") if a.get_text(strip=True) == "報名"), None)
        if (not day or day < today or not info or (status and "截止" in status.get_text())
                or (series and series.get_text(strip=True) in SKIP_SERIES)):
            continue
        key = (signup or info["href"]).split("#")[0]
        if key in seen:
            continue
        seen.add(key)
        img = li.select_one("figure img[src]")
        yield {
            "source_id": re.search(r"pno=(\d+)", info["href"])[1],
            "signup_url": signup if signup and signup.startswith("http") else urljoin(BASE, info["href"]),
            "info_url": urljoin(BASE, info["href"]),
            "image_url": urljoin(BASE, img["src"]) if img else None,
            "text": "\n".join([
                f"賽事名稱：{li.select_one('.entry-title').get_text(strip=True)}",
                f"系列：{series.get_text(strip=True) if series else ''}",
                f"日期：{day.isoformat()}",
                f"報名狀態：{status.get_text(strip=True) if status else ''}",
            ]),
        }


def brochure(page: BeautifulSoup, url: str) -> str | None:
    """「活動簡章【請按此】」的 PDF。頁面上其他 PDF 是公告、路線圖或往年檔案，連結文字常是空的。"""
    for a in page.select('.webeditor a[href$=".pdf"]'):
        before = [s.strip() for s in a.find_all_previous(string=True, limit=6) if s.strip()][:2]
        if a.get_text(strip=True) and any("簡章" in s for s in before):
            return urljoin(url, a["href"])
    return None


def items(today: date):
    for it in parse(get(BASE + "eventnew.asp").text, today):
        url = it.pop("info_url")
        try:
            page = BeautifulSoup(get(url).text, "html.parser")
            box = page.select_one(".webeditor")
            it["text"] += "\n" + (text_of(str(box)) if box else "")
            if pdf := brochure(page, url):
                reader = PdfReader(io.BytesIO(get(pdf).content))
                it["text"] += "\n簡章：\n" + "\n".join(p.extract_text() or "" for p in reader.pages)
        except Exception as e:  # 單場失敗不影響其他場，下次爬蟲會重試
            print(f"[cyclist] 活動頁或簡章抓取失敗 {url}: {e!r}", file=sys.stderr)
        yield it
