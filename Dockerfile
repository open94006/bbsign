# 同一個映像檔給兩種用途：
#   Cloud Run 服務：預設指令，跑 API 並提供前端網頁
#   Cloud Run Job：覆寫指令為 python -m crawl.run，每天爬一次
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY --from=web /web/dist ./static
ENV PORT=8080 PYTHONUNBUFFERED=1
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port $PORT"]
