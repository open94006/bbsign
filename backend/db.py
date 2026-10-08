import os
from pathlib import Path

import psycopg
import redis
from psycopg.rows import dict_row

CACHE_KEY = "bb:events"  # 與 rooning 共用同一個 Redis，key 一律加 bb: 前綴
# 沒設 REDIS_URL（本機開發）就不快取、不限流
cache = redis.from_url(os.environ["REDIS_URL"]) if os.getenv("REDIS_URL") else None


def connect() -> psycopg.Connection:
    # ponytail: 每個請求開一條連線，公開 API 大多走 Redis 快取；流量變大再換 psycopg_pool
    return psycopg.connect(os.environ["DATABASE_URL"], autocommit=True, row_factory=dict_row)


def init() -> None:
    with connect() as c:
        c.execute((Path(__file__).parent / "schema.sql").read_text())


def clear_cache() -> None:
    if cache:
        cache.delete(CACHE_KEY)
