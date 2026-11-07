FROM python:3.12-slim
WORKDIR /srv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY pyproject.toml ./
COPY takomo_api ./takomo_api
RUN pip install --no-cache-dir .
# Cloud Run sets $PORT
CMD ["sh", "-c", "uvicorn takomo_api.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
