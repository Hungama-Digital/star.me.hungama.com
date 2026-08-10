FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN groupadd --system starme && useradd --system --gid starme --home-dir /app starme

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir /renders && chown starme:starme /renders

WORKDIR /app
COPY pyproject.toml README.md alembic.ini ./
COPY backend ./backend
RUN python -m pip install --upgrade pip && python -m pip install .

USER starme
EXPOSE 8000
CMD ["uvicorn", "starme.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
