import json
import os
import secrets
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import Field

import db
from crawl.normalize import Race

URL = r"^https?://\S+$"


@asynccontextmanager
async def lifespan(_):
    db.init()
    yield


app = FastAPI(lifespan=lifespan)


# ---------- 公開 API ----------

PUBLIC = """
select id, name, sport, race_date, county, venue, distances_km, fee_min, fee_max, souvenirs,
       tags, signup_url, image_url, official_url, social_url, signup_open, signup_close, source
from events
where is_race and not hidden and county is not null
  and race_date >= (now() at time zone 'Asia/Taipei')::date
order by race_date, id
"""


@app.get("/api/events")
def events():
    # ponytail: 一次回傳全部未來賽事（幾百筆），篩選在前端做；超過幾千筆再改成伺服器端篩選
    body = db.cache.get(db.CACHE_KEY) if db.cache else None
    if body is None:
        with db.connect() as c:
            body = json.dumps(c.execute(PUBLIC).fetchall(), default=str, ensure_ascii=False)
        if db.cache:
            db.cache.set(db.CACHE_KEY, body, ex=3600)
    return Response(body, media_type="application/json", headers={"Cache-Control": "public, max-age=300"})


# ---------- 管理 API ----------

class EventIn(Race):
    name: str = Field(min_length=1)
    is_race: bool = True
    signup_url: str = Field(pattern=URL)
    official_url: str | None = Field(None, pattern=URL)
    social_url: str | None = Field(None, pattern=URL)
    image_url: str | None = Field(None, pattern=URL)
    hidden: bool = False


FIELDS = list(EventIn.model_fields)  # 全部對應 events 欄位名稱


def admin(request: Request) -> None:
    # Cloud Run 會把真實來源 IP 附加在 X-Forwarded-For 最後一個
    ip = request.headers.get("x-forwarded-for", "").split(",")[-1].strip() or request.client.host
    key = f"bb:authfail:{ip}"
    if db.cache and int(db.cache.get(key) or 0) >= 10:
        raise HTTPException(429, "登入失敗次數過多，請 15 分鐘後再試")
    token = request.headers.get("authorization", "").removeprefix("Bearer ")
    expected = os.environ.get("ADMIN_TOKEN", "")
    if not expected or not secrets.compare_digest(token.encode(), expected.encode()):
        if db.cache:
            db.cache.incr(key)
            db.cache.expire(key, 900)
        raise HTTPException(401, "管理密碼錯誤")


@app.get("/api/admin/events", dependencies=[Depends(admin)])
def admin_list():
    with db.connect() as c:
        return c.execute("select * from events order by race_date desc nulls last, id desc").fetchall()


@app.post("/api/admin/events", dependencies=[Depends(admin)])
def admin_create(e: EventIn):
    with db.connect() as c:
        row = c.execute(
            f"insert into events (source, source_id, locked, {', '.join(FIELDS)}) "
            f"values ('manual', %(source_id)s, true, {', '.join(f'%({f})s' for f in FIELDS)}) returning id",
            {**e.model_dump(), "source_id": uuid.uuid4().hex},
        ).fetchone()
    db.clear_cache()
    return row


@app.put("/api/admin/events/{event_id}", dependencies=[Depends(admin)])
def admin_update(event_id: int, e: EventIn):
    with db.connect() as c:
        row = c.execute(
            f"update events set {', '.join(f'{f} = %({f})s' for f in FIELDS)}, locked = true, updated_at = now() "
            "where id = %(id)s returning id",
            {**e.model_dump(), "id": event_id},
        ).fetchone()
    if not row:
        raise HTTPException(404, "找不到這筆賽事")
    db.clear_cache()
    return row


# ---------- 爬蟲（呼叫 Cloud Run Jobs API 啟動 bbsign-crawl） ----------

def run_api(method: str, path: str, **kw) -> dict:
    job = os.environ.get("CRAWL_JOB")  # cloudbuild.yaml 設定；本機沒有，請直接執行 python -m crawl.run
    if not job:
        raise HTTPException(503, "沒有設定爬蟲 Job（只有部署到 Cloud Run 才能從這裡啟動）")
    token = httpx.get(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        headers={"Metadata-Flavor": "Google"},
    ).json()["access_token"]
    r = httpx.request(method, f"https://run.googleapis.com/v2/{job}{path}",
                      headers={"Authorization": f"Bearer {token}"}, timeout=30, **kw)
    if r.is_error:
        raise HTTPException(502, f"Cloud Run 回應錯誤（{r.status_code}）：{r.text[:300]}")
    return r.json()


@app.get("/api/admin/crawl", dependencies=[Depends(admin)])
def crawl_status():
    return run_api("GET", "").get("latestCreatedExecution")  # 沒跑過是 null


@app.post("/api/admin/crawl", dependencies=[Depends(admin)])
def crawl_start(new: bool = False):
    last = run_api("GET", "").get("latestCreatedExecution")
    if last and not last.get("completionTime"):
        raise HTTPException(409, "爬蟲還在執行中，請等它跑完")
    args = ["-m", "crawl.run", *(["--new"] if new else [])]
    e = run_api("POST", ":run", json={"overrides": {"containerOverrides": [{"args": args}]}})["metadata"]
    return {"name": e["name"], "createTime": e["createTime"]}


# ---------- 前端靜態檔（Docker 建置時把 frontend/dist 複製到 static/） ----------

STATIC = Path(__file__).parent / "static"
if STATIC.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        f = (STATIC / path).resolve()
        return FileResponse(f if path and f.is_file() and f.is_relative_to(STATIC.resolve()) else STATIC / "index.html")
