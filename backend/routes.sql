-- 賽事路線圖（plans/race-routes.md）。每次啟動接在 schema.sql 後面重跑：改這裡、部署就生效。
-- 用「比賽日＋名稱關鍵字」對賽事：正式站和本機的 id 不同，同一場在不同來源的卡片也會一起對到。
-- 關鍵字避開台／臺（各來源寫法不同）；label 由長到短。
-- 嵌入網址：Ride with GPS https://ridewithgps.com/embeds?type=route&id=<路線 id>&metricUnits=true&sampleGraph=true
--           Garmin Connect https://connect.garmin.com/embed/course/<課程 id>

-- 日月潭環湖 11/1：主辦單位的 Ride with GPS（2021 年建立，2026 簡章仍連這兩條）；6K 沒有
update events set routes = '[
  {"label": "全馬", "url": "https://ridewithgps.com/embeds?type=route&id=38268345&metricUnits=true&sampleGraph=true"},
  {"label": "29K", "url": "https://ridewithgps.com/embeds?type=route&id=38261247&metricUnits=true&sampleGraph=true"}
]' where race_date = '2026-11-01' and name like '%日月潭環湖%';

-- 蘆洲觀音山 11/15：主辦單位的 Ride with GPS
update events set routes = '[
  {"label": "全馬", "url": "https://ridewithgps.com/embeds?type=route&id=53965330&metricUnits=true&sampleGraph=true"},
  {"label": "半馬", "url": "https://ridewithgps.com/embeds?type=route&id=52232801&metricUnits=true&sampleGraph=true"},
  {"label": "10K", "url": "https://ridewithgps.com/embeds?type=route&id=49445611&metricUnits=true&sampleGraph=true"},
  {"label": "4K", "url": "https://ridewithgps.com/embeds?type=route&id=53959782&metricUnits=true&sampleGraph=true"}
]' where race_date = '2026-11-15' and name like '%蘆洲觀音山%';

-- 台南秋季 11/29：主辦單位的 Garmin Connect 課程
update events set routes = '[
  {"label": "全馬", "url": "https://connect.garmin.com/embed/course/451753484"},
  {"label": "半馬", "url": "https://connect.garmin.com/embed/course/440864650"},
  {"label": "13K", "url": "https://connect.garmin.com/embed/course/451019781"},
  {"label": "6K", "url": "https://connect.garmin.com/embed/course/436539058"}
]' where race_date = '2026-11-29' and name like '%秋季馬拉松%';

-- 屏東風域曙光 2027/1/1：主辦單位的 Ride with GPS
update events set routes = '[
  {"label": "半馬", "url": "https://ridewithgps.com/embeds?type=route&id=50935009&metricUnits=true&sampleGraph=true"},
  {"label": "10K", "url": "https://ridewithgps.com/embeds?type=route&id=50935052&metricUnits=true&sampleGraph=true"},
  {"label": "4K", "url": "https://ridewithgps.com/embeds?type=route&id=50935174&metricUnits=true&sampleGraph=true"}
]' where race_date = '2027-01-01' and name like '%風域曙光%';

-- 臺中資訊盃 2027/1/24：主辦單位的 Ride with GPS
update events set routes = '[
  {"label": "全馬", "url": "https://ridewithgps.com/embeds?type=route&id=55117720&metricUnits=true&sampleGraph=true"},
  {"label": "半馬", "url": "https://ridewithgps.com/embeds?type=route&id=55117477&metricUnits=true&sampleGraph=true"},
  {"label": "12K", "url": "https://ridewithgps.com/embeds?type=route&id=55117601&metricUnits=true&sampleGraph=true"},
  {"label": "5K", "url": "https://ridewithgps.com/embeds?type=route&id=55117751&metricUnits=true&sampleGraph=true"}
]' where race_date = '2027-01-24' and name like '%資訊盃%';
