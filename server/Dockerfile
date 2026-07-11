# -------------------------------------------
# ARQUIVO: server/Dockerfile
# -------------------------------------------
# Estágio Base: Instala dependências comuns e copia arquivos do projeto
FROM python:3.11-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y gcc python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Instala dependências do requirements.txt
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia as pastas de banco de dados e servidor
COPY database /app/database
COPY server /app/server

# Define onde o Python deve procurar módulos (na raiz /app)
ENV PYTHONPATH=/app
WORKDIR /app/server


# Estágio Backend: Executa o servidor Gunicorn exposto
FROM base AS backend
EXPOSE 5328
CMD ["gunicorn", "--bind", "0.0.0.0:5328", "--workers", "2", "--threads", "4", "--timeout", "120", "backend:app"]


# Estágio Worker: Executa o processo de tarefas em background de forma isolada
FROM base AS worker
CMD ["python", "worker.py"]
