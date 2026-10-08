"""爬蟲寫入與 AI 抽取的自我檢查（在 backend/ 底下執行：python test_crawl.py）。

- 有 DATABASE_URL：檢查管理頁鎖定的賽事不會被爬蟲覆蓋
- 有 ANTHROPIC_API_KEY：用 crawl/fixtures 的真實頁面檢查 AI 抽出的欄位（會花一點 API 費用）
"""
import os
from datetime import date
from pathlib import Path

from bs4 import BeautifulSoup

import db
from crawl import bijical, normalize, run

FIXTURES = Path(__file__).parent / "crawl" / "fixtures"


def fake_race(name: str) -> normalize.Race:
    return normalize.Race(
        is_race=True, name=name, sport="路跑", race_date=date(2030, 1, 1), county="臺北市", venue=None,
        distances_km=[10], fee_min=None, fee_max=None, souvenirs=None, tags=["其他"], official_url=None,
        social_url=None, signup_open=None, signup_close=None,
    )


def check_locked_not_overwritten() -> None:
    db.init()
    real_extract = normalize.extract
    normalize.extract = lambda text: fake_race(text)
    try:
        with db.connect() as c:
            c.execute("delete from events where source = 'selftest'")
            assert run.upsert(c, "selftest", {"source_id": "1", "signup_url": "https://a.tw", "text": "第一版"})
            assert not run.upsert(c, "selftest", {"source_id": "1", "signup_url": "https://a.tw", "text": "第一版"}), "內容沒變不該重抽"
            assert not run.upsert(c, "selftest", {"source_id": "1", "signup_url": "https://a.tw", "text": "改版"}, new_only=True), "只找新賽事時不該重抽已有的"
            assert not run.upsert(c, "selftest", {"source_id": "1", "signup_url": "https://a.tw", "text": "改版"}, date(2031, 1, 1)), "已截止的不該重抽"
            c.execute("update events set name = '管理員改過', locked = true where source = 'selftest'")
            assert not run.upsert(c, "selftest", {"source_id": "1", "signup_url": "https://a.tw", "text": "第二版"})
            name = c.execute("select name from events where source = 'selftest'").fetchone()["name"]
            assert name == "管理員改過", f"鎖定的賽事被覆蓋了：{name}"
            c.execute("delete from events where source = 'selftest'")
    finally:
        normalize.extract = real_extract
    print("✓ 鎖定的賽事不會被爬蟲覆蓋")


def check_clean() -> None:
    r = fake_race("x")
    r.distances_km = [21.0, 10.0, 5.0, 5.0, 5.0]  # 樂活順發路跑：5K 跑步、健走、兒童組
    r.souvenirs = "歡樂不息上衣、雲朵朵托特包、永恆歡樂萬年桌曆、花現歡樂鑰匙圈吊飾、雲朵朵後背包、花現歡樂漁夫帽、完賽證書、完賽紀念獎牌、瓶裝飲品"
    r.official_url = "javascript:alert(1)"
    r = normalize.clean(r)
    assert r.distances_km == [21.0, 10.0, 5.0], r.distances_km
    assert len(r.souvenirs) <= 60 and r.souvenirs.endswith("等") and "、、" not in r.souvenirs, r.souvenirs
    assert r.official_url is None
    assert normalize.clean(fake_race("y")).souvenirs is None
    print(f"✓ 距離去重、紀念品截斷：{r.souvenirs}")


def check_bijical_links() -> None:
    def page(*links: tuple[str, str]) -> BeautifulSoup:
        a = "".join(f'<a class="comma-item" href="{h}">{t}</a>' for t, h in links)
        return BeautifulSoup('<li class="stack-column-item"><div class="data-title">主辦單位</div>'
                             '<div class="data-content"><a href="https://irunner.biji.co/x">協會</a></div></li>'
                             f'<li class="stack-column-item"><div class="data-title">相關連結</div><div class="data-content">{a}</div></li>',
                             "html.parser")
    info = "https://running.biji.co/index.php?q=competition&act=info&cid=1"
    bao = "https://bao-ming.com/eb/content/7098#reg"
    assert bijical.links(page(("線上報名", bao), ("活動簡章", bao)), info) == (bao, False)  # 其他平台：直接連過去
    assert bijical.links(page(("筆記報名", "https://irunner.biji.co/a/signup")), info)[1]  # 現有來源：略過
    assert bijical.links(page(("活動簡章", "https://signup.lohasnet.tw/x")), info)[1]  # 只有簡章在現有來源也算
    assert bijical.links(page(("活動簡章", "https://example.tw/a.pdf")), info) == (info, False)  # 沒報名連結：連運動筆記
    assert bijical.links(BeautifulSoup("", "html.parser"), info) == (info, False)
    assert bijical.links(page(("線上報名", "https://ad.doubleclick.net/ddm/trackclk/N1;dc_trk_aid=1")), info) == (info, False)
    print("✓ 運動筆記行事曆的報名連結與去重")


# 檔名 -> (縣市, 比賽日, 運動, 一定要抽到的距離)；縣市 None 表示海外賽要被濾掉
EXPECTED = {
    "ctrun": ("高雄市", date(2026, 11, 8), "路跑", 4),
    "focusline": ("臺中市", date(2027, 4, 25), "三鐵", None),
    "lohasnet": ("高雄市", date(2027, 4, 18), "路跑", 21),
    "sportsnet": ("金門縣", date(2027, 1, 16), "路跑", 42.195),
    "biji": (None, date(2027, 3, 6), "路跑", None),  # 不丹國際馬拉松
}


def check_normalize_fixtures() -> None:
    for src, (county, day, sport, dist) in EXPECTED.items():
        r = normalize.extract((FIXTURES / f"{src}.txt").read_text())
        assert r.county == county, f"{src} 縣市：{r.county}"
        assert r.race_date == day, f"{src} 日期：{r.race_date}"
        if county:
            assert r.is_race and r.sport == sport, f"{src} 運動：{r.sport}"
        if dist:
            assert any(abs(d - dist) < 0.3 for d in r.distances_km), f"{src} 距離：{r.distances_km}"
        print(f"✓ {src}：{r.name}｜{r.county}｜{r.distances_km}｜{r.fee_min}–{r.fee_max}｜{r.souvenirs}｜{r.tags}")


if __name__ == "__main__":
    check_clean()
    check_bijical_links()
    if os.getenv("DATABASE_URL"):
        check_locked_not_overwritten()
    if os.getenv("ANTHROPIC_API_KEY"):
        check_normalize_fixtures()
    else:
        print("略過 AI 抽取檢查：沒有設定 ANTHROPIC_API_KEY")
