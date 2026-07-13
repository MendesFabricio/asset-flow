# -------------------------------------------
# ARQUIVO: server/Dockerfile
# -------------------------------------------

# --- Estágio 1: Builder (Compilação e Instalação) ---
FROM python:3.11-slim AS builder

WORKDIR /app

# Instala ferramentas de build (gcc, etc) que não irão para a imagem final
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Cria o ambiente virtual
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Instala dependências do requirements.txt
COPY server/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# --- Estágio 2: Imagem Base Final ---
FROM python:3.11-slim AS base

WORKDIR /app

# Instala bibliotecas de runtime necessárias (se houver, e.g. libpq) sem os headers de desenvolvimento
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copia o ambiente virtual pronto do builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copia as pastas necessárias da aplicação
COPY database /app/database
COPY server /app/server

# Configurações do Python e diretório raiz
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app/server


# --- Estágio 3: Backend (Flask + Gunicorn) ---
FROM base AS backend
EXPOSE 5328
CMD ["gunicorn", "--bind", "0.0.0.0:5328", "--workers", "2", "--threads", "4", "--timeout", "120", "backend:app"]


# --- Estágio 4: Worker (Background Tasks) ---
FROM base AS worker
CMD ["python", "worker.py"]
