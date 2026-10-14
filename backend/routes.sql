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

-- 以下 11 場：2026/11–2027/3 掃描賽事頁原始 HTML 找到的主辦單位路線（2026-10-14）。
-- trip 是跑者實跑紀錄，年份舊的在 label 標出來。

-- 八百壯士 制霸極西 11/1：51.7K 的路線是私人路線，讀不到
update events set routes = '[
  {"label": "102.5K", "url": "https://ridewithgps.com/embeds?type=route&id=52655850&metricUnits=true&sampleGraph=true"}
]' where race_date = '2026-11-01' and name like '%制霸極西%';

-- 如來神掌 100 式 11/7
update events set routes = '[
  {"label": "100K", "url": "https://ridewithgps.com/embeds?type=route&id=41334681&metricUnits=true&sampleGraph=true"},
  {"label": "手指 50K", "url": "https://ridewithgps.com/embeds?type=route&id=41338946&metricUnits=true&sampleGraph=true"},
  {"label": "手心 50K（2018 紀錄）", "url": "https://ridewithgps.com/embeds?type=trip&id=20944759&metricUnits=true&sampleGraph=true"}
]' where race_date = '2026-11-07' and name like '%如來神掌%';

-- SKYHUNTER 士林越野 11/8
update events set routes = '[
  {"label": "50K", "url": "https://ridewithgps.com/embeds?type=route&id=54875557&metricUnits=true&sampleGraph=true"},
  {"label": "24K", "url": "https://ridewithgps.com/embeds?type=route&id=52030711&metricUnits=true&sampleGraph=true"},
  {"label": "8K", "url": "https://ridewithgps.com/embeds?type=route&id=45629006&metricUnits=true&sampleGraph=true"},
  {"label": "親子 3K", "url": "https://ridewithgps.com/embeds?type=route&id=52031352&metricUnits=true&sampleGraph=true"}
]' where race_date = '2026-11-08' and name like '%士林越野%';

-- 宜蘭冬山河超級馬拉松 11/20：各組都繞同一圈
update events set routes = '[
  {"label": "每圈 11.2K", "url": "https://ridewithgps.com/embeds?type=route&id=48873487&metricUnits=true&sampleGraph=true"}
]' where race_date = '2026-11-20' and name like '%冬山河超級%';

-- 八百壯士 制霸浸水營 12/5：53.1K 的路線讀不到
update events set routes = '[
  {"label": "115K", "url": "https://ridewithgps.com/embeds?type=route&id=52465060&metricUnits=true&sampleGraph=true"},
  {"label": "62K", "url": "https://ridewithgps.com/embeds?type=route&id=52465002&metricUnits=true&sampleGraph=true"}
]' where race_date = '2026-12-05' and name like '%浸水營%';

-- 美濃馬拉松 12/13
update events set routes = '[
  {"label": "45K", "url": "https://ridewithgps.com/embeds?type=route&id=54109009&metricUnits=true&sampleGraph=true"}
]' where race_date = '2026-12-13' and name like '%美濃馬拉松%';

-- 北宜公路超級馬拉松 12/19：只有 2018 年的實跑紀錄
update events set routes = '[
  {"label": "55K（2018 紀錄）", "url": "https://ridewithgps.com/embeds?type=trip&id=29309359&metricUnits=true&sampleGraph=true"},
  {"label": "27K（2018 紀錄）", "url": "https://ridewithgps.com/embeds?type=trip&id=26459310&metricUnits=true&sampleGraph=true"},
  {"label": "8K（2018 紀錄）", "url": "https://ridewithgps.com/embeds?type=trip&id=26459330&metricUnits=true&sampleGraph=true"}
]' where race_date = '2026-12-19' and name like '%北宜公路%';

-- SUPERACE 冬嶺野馬 2027/1/3
update events set routes = '[
  {"label": "35K", "url": "https://ridewithgps.com/embeds?type=route&id=56707496&metricUnits=true&sampleGraph=true"},
  {"label": "23K", "url": "https://ridewithgps.com/embeds?type=route&id=56707495&metricUnits=true&sampleGraph=true"},
  {"label": "12K", "url": "https://ridewithgps.com/embeds?type=route&id=56707494&metricUnits=true&sampleGraph=true"},
  {"label": "5K", "url": "https://ridewithgps.com/embeds?type=route&id=56707493&metricUnits=true&sampleGraph=true"}
]' where race_date = '2027-01-03' and name like '%冬嶺野馬%';

-- 陽明山超級馬拉松 2027/1/23：63K、21K 是 2025 年的路線，其餘只有 2019 年紀錄
update events set routes = '[
  {"label": "63K", "url": "https://ridewithgps.com/embeds?type=route&id=50334657&metricUnits=true&sampleGraph=true"},
  {"label": "50K（2019 紀錄）", "url": "https://ridewithgps.com/embeds?type=trip&id=28304473&metricUnits=true&sampleGraph=true"},
  {"label": "全馬（2019 紀錄）", "url": "https://ridewithgps.com/embeds?type=trip&id=28304303&metricUnits=true&sampleGraph=true"},
  {"label": "21K", "url": "https://ridewithgps.com/embeds?type=route&id=50334192&metricUnits=true&sampleGraph=true"},
  {"label": "10K（2019 紀錄）", "url": "https://ridewithgps.com/embeds?type=trip&id=28304192&metricUnits=true&sampleGraph=true"},
  {"label": "5K（2019 紀錄）", "url": "https://ridewithgps.com/embeds?type=trip&id=28304147&metricUnits=true&sampleGraph=true"}
]' where race_date = '2027-01-23' and name like '%陽明山超級%';

-- 鎮西堡王者之路超馬 2027/1/24
update events set routes = '[
  {"label": "100K", "url": "https://ridewithgps.com/embeds?type=route&id=55256174&metricUnits=true&sampleGraph=true"},
  {"label": "80K", "url": "https://ridewithgps.com/embeds?type=route&id=55255822&metricUnits=true&sampleGraph=true"},
  {"label": "50K", "url": "https://ridewithgps.com/embeds?type=route&id=55255154&metricUnits=true&sampleGraph=true"}
]' where race_date = '2027-01-24' and name like '%鎮西堡%';

-- 木架山馬拉松暨尾牙馬 2027/1/31：主辦單位的 Garmin Connect 課程
update events set routes = '[
  {"label": "全馬", "url": "https://connect.garmin.com/embed/course/499685782"},
  {"label": "半馬", "url": "https://connect.garmin.com/embed/course/499106755"},
  {"label": "12K", "url": "https://connect.garmin.com/embed/course/460686167"},
  {"label": "5K", "url": "https://connect.garmin.com/embed/course/499105106"},
  {"label": "2K 健走", "url": "https://connect.garmin.com/embed/course/499113486"}
]' where race_date = '2027-01-31' and name like '%木架山%';
