"""運動筆記「找賽事」行事曆：running.biji.co 清單 + 每場內頁。

行事曆收錄各家報名平台的賽事。報名連結指向現有來源的賽事會標成 covered，交給 run.py 略過並清掉舊資料；
其他平台（伊貝特、JoinNow 等）直接連過去；還沒有報名連結的先連運動筆記的賽事頁。
"""
import re
import sys
from datetime import date
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

from .fetch import get, text_of

NAME = "bijical"
BASE = "https://running.biji.co/"
# 現有爬蟲的網域：全統、路協、筆記報名、樂活、眾點
COVERED = ("ctrun.com.tw", "sportsnet.org.tw", "irunner.biji.co", "lohasnet.tw", "focusline.com.tw")


def links(page: BeautifulSoup, info_url: str) -> tuple[str, bool]:
    """回傳（報名連結, 是否已由現有來源收錄）。「相關連結」裡只要有一個指向現有來源就算已收錄。"""
    box = next((li for li in page.select(".stack-column-item")
                if li.select_one(".data-title") and li.select_one(".data-title").get_text(strip=True) == "相關連結"), None)
    # ponytail: 廣告追蹤連結看不出目的地，又不能點（會灌廣告點擊數），直接忽略；遇過一場路協賽事因此重複
    found = [(a.get_text(strip=True), a["href"]) for a in box.select("a[href]")
             if not urlsplit(a["href"]).netloc.endswith("doubleclick.net")] if box else []
    covered = any(urlsplit(h).netloc.endswith(COVERED) for _, h in found)
    signup = next((h for t, h in found if "報名" in t and h.startswith("http")), info_url)
    return signup, covered


def items(today: date):
    listing = BeautifulSoup(get(BASE + "?q=competition").text, "html.parser")
    # 沒有 data-year 的是表頭和廣告置頂列，廣告列在原本的月份裡還會再出現一次
    for row in listing.select(".competition-list-row[data-year]"):
        a, d = row.select_one(".competition-name a"), row.select_one(".competition-date-title")
        # 日期有「10-03 (週 六)」和「2027.01.10」兩種寫法，取最後的月、日
        m = d and re.search(r"(\d{1,2})[-.](\d{1,2})\D*$", d.get_text(strip=True))
        if not a or not m or date(int(row["data-year"]), int(m[1]), int(m[2])) < today:
            continue
        cid = re.search(r"cid=(\d+)", a["href"])[1]
        url = f"{BASE}index.php?q=competition&act=info&cid={cid}"
        try:
            page = BeautifulSoup(get(url).text, "html.parser")
        except Exception as e:  # 單頁失敗不影響其他場，下次爬蟲會重試
            print(f"[bijical] 內頁抓取失敗 {url}: {e}", file=sys.stderr)
            continue
        signup, covered = links(page, url)
        if covered:
            yield {"source_id": cid, "covered": True}
            continue
        detail = page.select_one(".comp-detail")
        og = page.select_one('meta[property="og:image"]')
        image = og.get("content") if og else None
        place = row.select_one(".competition-place")
        yield {
            "source_id": cid,
            "signup_url": signup,
            "image_url": None if not image or "/default_jpg/" in image else urljoin(BASE, image),  # 預設圖不要
            "text": "\n".join([
                f"賽事名稱：{a.get_text(strip=True)}",
                f"年份：{row['data-year']}",
                f"縣市：{place.get_text(strip=True) if place else ''}",
                # 「評分/討論」之後是留言和同週其他賽事，會干擾 AI 抽欄位
                text_of(str(detail)).split("評分/討論")[0] if detail else "",
            ]),
        }
