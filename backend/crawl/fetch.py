"""所有爬蟲共用的 HTTP 抓取：每個網域每秒最多 1 個請求、遵守 robots.txt。"""
import re
import time
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup

UA = "BBSignBot/0.1 (sports event aggregator)"
_client = httpx.Client(headers={"User-Agent": UA}, timeout=30, follow_redirects=True)
_last: dict[str, float] = {}
_robots: dict[str, RobotFileParser] = {}


def _throttled(url: str) -> httpx.Response:
    host = urlsplit(url).netloc
    wait = _last.get(host, 0) + 1 - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    try:
        return _client.get(url)
    finally:
        _last[host] = time.monotonic()


def get(url: str) -> httpx.Response:
    host = urlsplit(url).netloc
    if host not in _robots:
        rp = RobotFileParser()
        r = _throttled(f"https://{host}/robots.txt")
        # 404 或回傳 HTML 錯誤頁都視為沒有限制
        ok = r.status_code == 200 and "text/plain" in r.headers.get("content-type", "")
        rp.parse(r.text.splitlines() if ok else [])
        _robots[host] = rp
    if not _robots[host].can_fetch(UA, url):
        raise PermissionError(f"robots.txt 不允許：{url}")
    r = _throttled(url)
    r.raise_for_status()
    return r


def text_of(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    text = soup.get_text("\n")
    return re.sub(r"\n\s*\n+", "\n", re.sub(r"[ \t\xa0]+", " ", text)).strip()
