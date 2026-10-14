"""爬蟲寫入與 AI 抽取的自我檢查（在 backend/ 底下執行：python test_crawl.py）。

- 有 DATABASE_URL：檢查管理頁鎖定的賽事不會被爬蟲覆蓋
- 有 ANTHROPIC_API_KEY：用 crawl/fixtures 的真實頁面檢查 AI 抽出的欄位（會花一點 API 費用）
"""
import os
from datetime import date
from pathlib import Path

from bs4 import BeautifulSoup

import db
from crawl import bijical, cyclist, normalize, run, runnersquare, sportaiwan

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
    assert bijical.links(page(("活動簡章", " https://example.tw/a.pdf")), info) == ("https://example.tw/a.pdf", False)  # 沒報名連結：連簡章
    assert bijical.links(page(("官方網站", "https://nb10k.tw/"), ("線上報名", bao)), info) == (bao, False)  # 報名優先於官網
    assert bijical.links(page(("粉絲專頁", "https://facebook.com/x")), info) == (info, False)  # 沒報名、簡章、官網：連運動筆記
    assert bijical.links(BeautifulSoup("", "html.parser"), info) == (info, False)
    assert bijical.links(page(("線上報名", "https://ad.doubleclick.net/ddm/trackclk/N1;dc_trk_aid=1")), info) == (info, False)
    print("✓ 運動筆記行事曆的報名連結與去重")


def check_runnersquare() -> None:
    def row(href: str, day: str, status: str, cls: str = "") -> str:
        return (f'<tr class="{cls}"><td></td><td><a href="{href}">賽事{day}</a></td><td></td><td>{day} 日 06:00</td>'
                '<td>臺東縣臺東市</td><td><button title="費用：800<br/>限額：500">21K</button></td><td>協會</td>'
                f'<td>{status}</td></tr>')
    html = "<table>" + "".join([
        row("https://bao-ming.com/eb/content/1#2", "10/18", "~10月18日"),
        row("https://bao-ming.com/eb/content/1#3", "10/19", ""),  # 同網址、名稱不同
        row("https://a.tw/x", "11/01", "已截止"),
        row("https://b.tw/y", "10/11", "", "oldactivity"),
        row("https://c.tw/z", "10/10", ""),  # 昨天但還沒標成過去
        row("https://d.tw/w", "03/13", "7月27日~12月15日"),
    ]) + "</table>"
    got = list(runnersquare.parse(html, date(2026, 10, 12)))
    assert [it["source_id"].split("|")[0] for it in got] == ["bao-ming.com/eb/content/1"] * 2 + ["d.tw/w"], got
    assert got[0]["source_id"] != got[1]["source_id"], "同網址不同名稱是不同賽事"
    assert "日期：2027-03-13" in got[2]["text"] and "21K 費用800 限額500" in got[0]["text"], got[0]["text"]
    assert runnersquare.key("https://www.Bao-Ming.com/eb/content/7198/#reg") == "bao-ming.com/eb/content/7198"
    print("✓ 跑者廣場：跳過已截止與過去賽事、推算年份、網址比對")


def check_duplicates() -> None:
    assert run.same_race("2026 宜蘭冬山河超級馬拉松", "2026宜蘭冬山河超級馬拉松")
    assert not run.same_race("2026 LAVA 大鵬灣暨115學年度鐵人三項甄試賽", "2026 LAVAKIDS 大鵬灣小鐵人賽")
    assert run.same_race("2026 冬山河馬拉松 Dongshan  Marathon", "2026 冬山河馬拉松")  # SporTaiwan 與樂活
    assert not run.same_race("2026 IRONKIDS Taiwan 墾丁國際小鐵人", "2026 IRONMAN 70.3 Kenting 墾丁國際")
    assert not run.same_race("2026 OPEN!RUN", "2026 ELLE RUN")  # 純英文名照樣比英文
    d1, d2 = date(2026, 10, 25), date(2027, 3, 13)
    rows = [  # 2026-10 線上資料的真實案例
        {"id": 1, "source": "bijical", "name": "2026 長榮航空馬拉松", "race_date": d1, "county": "臺北市", "sport": "路跑"},
        {"id": 2, "source": "sportsnet", "name": "2026 長榮航空馬拉松", "race_date": d1, "county": "臺北市", "sport": "路跑"},
        {"id": 3, "source": "manual", "name": "2026長榮航空馬拉松", "race_date": d1, "county": "臺北市", "sport": "路跑"},
        {"id": 4, "source": "lohasnet", "name": "2027第二屆木棉花半程馬拉松", "race_date": d2, "county": "臺南市", "sport": "路跑"},
        {"id": 5, "source": "bijical", "name": "2027花蓮太平洋浪花半程馬拉松", "race_date": d2, "county": "花蓮縣", "sport": "路跑"},
        {"id": 6, "source": "focusline", "name": "2026台灣極限超級鐵人賽", "race_date": d2, "county": "臺南市", "sport": "三鐵"},
        {"id": 7, "source": "bijical", "name": "2026台灣極限超級鐵人推廣路跑", "race_date": d2, "county": "臺南市", "sport": "路跑"},
        {"id": 8, "source": "focusline", "name": "2026 濁水溪紫金馬拉松-花城竹山站", "race_date": d2, "county": "南投縣", "sport": "路跑"},
        {"id": 9, "source": "focusline", "name": "2026 濁水溪紫金馬拉松-花城竹山站", "race_date": d2, "county": "南投縣", "sport": "路跑"},
    ]
    # 管理頁 > 報名平台 > 行事曆；同來源留先收的；不同縣市、不同運動的相近名稱不併
    assert run.duplicates(rows) == {1: 3, 2: 3, 9: 8}, run.duplicates(rows)
    print("✓ 去重：依來源優先序保留一筆，同日名稱相近但不同縣市或運動的不併")


def check_sportaiwan() -> None:
    def li(aid: int, day: str) -> str:
        return (f'<li><div class="spor_m_photo"><a href="//sportaiwan.com/activity/activity_register.php?id={aid}">'
                f'<img src="//sportaiwan.com/upload/activity/{aid}/am_image2.jpg?_=1"></a></div>'
                f'<div class="spor_m_title"><a href="//sportaiwan.com/activity/activity_register.php?id={aid}">賽事{aid}</a></div>'
                '<div class="spor_m_time">活動地點：宜蘭縣冬山鄉 <div class="spor_mstar">0<span>評價</span></div></div>'
                f'<div class="spor_m_time">活動日期：{day}</div><div class="spor_m_time">報名期限：0000.00.00-2026.12.01</div></li>')
    html = (f'<div class="spor_main_azone"><ul>{li(1, "2026-11-14")}{li(2, "2026-10-13")}</ul></div>'
            f'<div class="spor_main_azone finish_activity"><ul>{li(3, "2026-12-01")}</ul></div>')
    got = list(sportaiwan.parse(html, date(2026, 10, 14)))
    assert [it["source_id"] for it in got] == ["1"], got  # 已過的、截止區的不要
    assert got[0]["signup_url"] == "https://sportaiwan.com/activity/activity_register.php?id=1"
    assert got[0]["image_url"] == "https://sportaiwan.com/upload/activity/1/am_image2.jpg"
    assert "評價" not in got[0]["text"] and "報名期限：未公布-2026.12.01" in got[0]["text"], got[0]["text"]
    print("✓ SporTaiwan：只收報名中、還沒比賽的活動")


def check_cyclist() -> None:
    def li(pno: int, day: str, status: str = "報名中", series: str = "臺灣自行車登山王挑戰", signup: str = "7155#1") -> str:
        return (f'<li><div class="eventItem"><figure><img src="upfile/eventpic/{pno}.jpg">'
                f'<!--<div class="date">{day}</strong></div>--></figure>'
                f'<div class="entry-info"><span class="btn btn-danger">{status}</span><h3 class="entry-title">賽事{pno}</h3>'
                f'<div class="entry-meta">{series}</div></div><div class="entry-footer">'
                f'<a href="event_txt.asp?pno={pno}">簡章</a><a href="https://bao-ming.com/eb/content/{signup}">報名</a></div></div></li>')
    html = '<ul id="grid">' + "".join([
        li(1, "2&nbsp;Nov.<strong>2026"),
        li(2, "2&nbsp;Nov.<strong>2026", signup="7155#2"),  # 英文版活動頁，同一個伊貝特活動
        li(3, "21&nbsp;Sep.<strong>2026"),  # 已經過了
        li(4, "30&nbsp;Oct.<strong>2026", status="截止報名", signup="1"),
        li(5, "11&nbsp;Nov.<strong>2026", series="線上虛擬騎乘", signup="2"),
    ]) + "</ul>"
    got = list(cyclist.parse(html, date(2026, 10, 14)))
    assert [it["source_id"] for it in got] == ["1"], got
    assert got[0]["signup_url"] == "https://bao-ming.com/eb/content/7155#1" and "日期：2026-11-02" in got[0]["text"]
    page = BeautifulSoup('<div class="webeditor">重要公告【<a href="/a.pdf">請按此</a>】<a href="/old.pdf"></a>'
                         '活動簡章【<span><a href="/b.pdf">請按此</a></span>】</div>', "html.parser")
    assert cyclist.brochure(page, "https://www.cyclist.org.tw/event_txt.asp?pno=1") == "https://www.cyclist.org.tw/b.pdf"
    print("✓ 自行車騎士協會：只收報名中、還沒比賽、非線上的活動，英文版不重複，找得到簡章 PDF")


# 檔名 -> (縣市, 比賽日, 運動, 一定要抽到的距離)；縣市 None 表示海外賽要被濾掉
EXPECTED = {
    "ctrun": ("高雄市", date(2026, 11, 8), "路跑", 4),
    "focusline": ("臺中市", date(2027, 4, 25), "三鐵", None),
    "lohasnet": ("高雄市", date(2027, 4, 18), "路跑", 21),
    "sportsnet": ("金門縣", date(2027, 1, 16), "路跑", 42.195),
    "biji": (None, date(2027, 3, 6), "路跑", None),  # 不丹國際馬拉松
    "sportaiwan": ("新北市", date(2026, 12, 13), "路跑", 42.195),
    "cyclist": ("花蓮縣", date(2026, 10, 30), "自行車", 122),
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
    check_runnersquare()
    check_duplicates()
    check_sportaiwan()
    check_cyclist()
    if os.getenv("DATABASE_URL"):
        check_locked_not_overwritten()
    if os.getenv("ANTHROPIC_API_KEY"):
        check_normalize_fixtures()
    else:
        print("略過 AI 抽取檢查：沒有設定 ANTHROPIC_API_KEY")
