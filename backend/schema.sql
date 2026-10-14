create table if not exists events (
  id serial primary key,
  source text not null,                -- ctrun / sportsnet / biji / lohasnet / focusline / sportaiwan / bijical / runnersquare / manual
  source_id text not null,
  signup_url text not null,
  image_url text,                      -- 報名網站的賽事主視覺（爬蟲直接帶回，不經過 AI）
  content_hash text,                   -- 內頁文字沒變就不重新呼叫 AI
  is_race boolean not null default true,
  name text not null,
  sport text check (sport in ('路跑', '自行車', '三鐵')),
  race_date date,
  county text,
  venue text,
  distances_km real[] not null default '{}',
  fee_min int,
  fee_max int,
  souvenirs text,
  tags text[] not null default '{}',
  official_url text,
  social_url text,
  signup_open date,
  signup_close date,
  locked boolean not null default false, -- 管理頁改過，爬蟲不覆蓋
  hidden boolean not null default false, -- 管理頁「刪除」只隱藏，避免爬蟲又加回來
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

-- 舊資料表補欄位
alter table events add column if not exists image_url text;
-- 路線圖：[{"label": "全馬", "url": "<Ride with GPS／Garmin 嵌入網址>"}]，資料在 routes.sql。
-- 爬蟲的 upsert 和管理頁存檔都只寫自己的欄位，不會覆蓋這欄
alter table events add column if not exists routes jsonb;
-- 同一場賽事被多個來源收錄時，指向保留的那筆；前台不顯示。爬蟲每次跑完重算（crawl/run.py dedupe）
alter table events add column if not exists dup_of int;
