FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build


FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    BACKEND_HOST=0.0.0.0 \
    BACKEND_PORT=8787 \
    DATABASE_PATH=/data/dashboard.db \
    FRONTEND_DIST=/app/frontend/dist

WORKDIR /app

COPY backend/pyproject.toml /app/backend/pyproject.toml
COPY backend/app/ /app/backend/app/
RUN pip install --no-cache-dir /app/backend \
    && mkdir -p /data

COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

WORKDIR /app/backend
EXPOSE 8787

CMD ["python", "-m", "app.main"]
