# -------------------------------------------
# ARQUIVO: server/Dockerfile
# -------------------------------------------
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc python3-dev

# 1. Instala dependências
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 2. Copia AS DUAS pastas (server e database)
# Se o build falhar aqui, é porque você não ajustou o "context: ." no docker-compose
COPY database /app/database
COPY server /app/server

# 3. Define onde o Python deve procurar módulos (na raiz /app)
ENV PYTHONPATH=/app

# 4. Entra na pasta do servidor para rodar
WORKDIR /app/server

EXPOSE 5328
CMD ["gunicorn", "--bind", "0.0.0.0:5328", "--workers", "1", "--threads", "4", "--timeout", "120", "backend:app"]
