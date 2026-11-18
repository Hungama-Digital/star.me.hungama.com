FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN groupadd --system starme && useradd --system --gid starme --home-dir /app starme

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir /renders && chown starme:starme /renders
# Subscriber portraits registered from the App. Created here so the named
# volume inherits starme ownership on first mount; the API runs unprivileged.
RUN mkdir /faces && chown starme:starme /faces

# Higgsfield CLI: renders bill the workspace's dashboard credits through it.
# Pinned and checksum-verified. Its sign-in lives in a volume at
# /app/.config/higgsfield, made here so the volume inherits starme ownership.
ARG HF_CLI_VERSION=1.2.2
ARG HF_CLI_SHA256=6a642f61f409a00d724de3079c1a7a25777eb1e49a2e0c3814e8a6ea3f49bb51
ADD https://github.com/higgsfield-ai/cli/releases/download/v${HF_CLI_VERSION}/hf_${HF_CLI_VERSION}_linux_amd64.tar.gz /tmp/hf.tgz
RUN echo "${HF_CLI_SHA256}  /tmp/hf.tgz" | sha256sum -c - \
    && tar -xzf /tmp/hf.tgz -C /usr/local/bin hf && rm /tmp/hf.tgz \
    && ln -s /usr/local/bin/hf /usr/local/bin/higgsfield \
    && mkdir -p /app/.config/higgsfield && chown -R starme:starme /app/.config

WORKDIR /app
COPY pyproject.toml README.md alembic.ini ./
COPY backend ./backend
# insightface compiles a C++ extension; the toolchain is purged after install.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends g++ \
    && python -m pip install --upgrade pip && python -m pip install . \
    && apt-get purge --yes g++ && apt-get autoremove --yes \
    && rm -rf /var/lib/apt/lists/*

# Bake the face-QA model so workers never download at render time.
ENV INSIGHTFACE_HOME=/opt/insightface
RUN python -c "from insightface.app import FaceAnalysis; \
    FaceAnalysis(name='buffalo_s', root='/opt/insightface', \
    providers=['CPUExecutionProvider'])" \
    && chmod -R a+rX /opt/insightface

USER starme
EXPOSE 8000
CMD ["uvicorn", "starme.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
