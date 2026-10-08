"""爬蟲進入點（在 backend/ 底下執行）。

    python -m crawl.run                 全部來源：抓取 → AI 正規化 → 寫入資料庫
    python -m crawl.run biji ctrun      只跑指定來源
    python -m crawl.run --new           只處理資料庫還沒有的新賽事（每 3 天排程）
    python -m crawl.run --dry [來源…]   只抓不寫，原始資料以 JSON Lines 印到 stdout，並檢查每站至少抓到 1 筆

不加 --new 是完整更新（每週排程）：已截止報名的賽事跳過，其餘內容有變才重抽。
"""
import hashlib
import json
import re
import sys
from datetime import date, datetime, timedelta, timezone

import db
from . import biji, bijical, ctrun, focusline, lohasnet, normalize, sportsnet

SOURCES = {m.NAME: m for m in (ctrun, sportsnet, biji, lohasnet, focusline, bijical)}
COLS = (
    "signup_url", "image_url", "content_hash", "is_race", "name", "sport", "race_date", "county", "venue",
    "distances_km", "fee_min", "fee_max", "souvenirs", "tags", "official_url", "social_url",
    "signup_open", "signup_close",
)
UPSERT = f"""
insert into events (source, source_id, {", ".join(COLS)})
values (%(source)s, %(source_id)s, {", ".join(f"%({c})s" for c in COLS)})
on conflict (source, source_id) do update
set {", ".join(f"{c} = excluded.{c}" for c in COLS)}, updated_at = now()
where not events.locked
"""


def dry(names: list[str], today: date) -> None:
    for name in names:
        everything = list(SOURCES[name].items(today))
        got = [it for it in everything if not it.get("covered")]
        for it in got:
            print(json.dumps({"source": name, **it}, ensure_ascii=False))
        assert got, f"{name} 沒抓到任何賽事"
        for it in got:
            assert it["source_id"] and it["signup_url"].startswith("http") and len(it["text"]) > 30, it
        skipped = len(everything) - len(got)
        print(f"✓ {name}：{len(got)} 筆" + (f"，另 {skipped} 筆其他來源已有" if skipped else ""), file=sys.stderr)


def upsert(c, source: str, it: dict, today: date | None = None, new_only: bool = False) -> bool:
    h = hashlib.sha256(it["text"].encode()).hexdigest()
    row = c.execute(
        "select content_hash, locked, coalesce(signup_close, race_date) as closes from events"
        " where source = %s and source_id = %s",
        (source, it["source_id"]),
    ).fetchone()
    if row and (new_only or (today and row["closes"] and row["closes"] < today)):
        return False  # 只找新賽事時跳過已有的；已截止的不再更新
    image = it.get("image_url") if re.match(r"https?://", it.get("image_url") or "") else None
    if row and (row["locked"] or row["content_hash"] == h):
        if not row["locked"]:  # 內容沒變就不呼叫 AI，只更新爬蟲直接帶回的欄位
            c.execute(
                "update events set signup_url = %s, image_url = %s where source = %s and source_id = %s",
                (it["signup_url"], image, source, it["source_id"]),
            )
        return False
    race = normalize.extract(it["text"])
    c.execute(UPSERT, {**race.model_dump(), "source": source, "source_id": it["source_id"],
                       "signup_url": it["signup_url"], "image_url": image, "content_hash": h})
    return True


def crawl(names: list[str], today: date, new_only: bool = False) -> None:
    db.init()
    with db.connect() as c:
        for name in names:
            changed = failed = 0
            try:
                for it in SOURCES[name].items(today):
                    if it.get("covered"):  # 其他來源已有這場：清掉之前收進來的那筆（管理頁改過的保留）
                        c.execute("delete from events where source = %s and source_id = %s and not locked",
                                  (name, it["source_id"]))
                        continue
                    try:
                        changed += upsert(c, name, it, today, new_only)
                    except Exception as e:  # 單筆失敗不影響其他筆，下次爬蟲會重試
                        failed += 1
                        print(f"[{name}] {it['source_id']} 失敗：{e!r}", file=sys.stderr)
            except Exception as e:  # 整站失敗（改版、擋爬）不影響其他站
                print(f"[{name}] 清單抓取失敗：{e!r}", file=sys.stderr)
            print(f"[{name}] 更新 {changed} 筆，失敗 {failed} 筆", file=sys.stderr)
            db.clear_cache()  # 每站跑完就清，前台不用等全部來源跑完（第一次爬可能要很久）


if __name__ == "__main__":
    args = sys.argv[1:]
    names = [a for a in args if not a.startswith("--")] or list(SOURCES)
    today = datetime.now(timezone(timedelta(hours=8))).date()  # 台灣時間，無日光節約
    if "--dry" in args:
        dry(names, today)
    else:
        crawl(names, today, new_only="--new" in args)
