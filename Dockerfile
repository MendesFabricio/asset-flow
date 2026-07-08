# -------------------------------------------
# ARQUIVO: ./Dockerfile (Na pasta Raiz)
# -------------------------------------------

# Usa imagem Node.js
FROM node:20-alpine

# Diretório de trabalho
WORKDIR /app

# Copia os arquivos de dependência
COPY package*.json ./

# Instala as dependências
RUN npm ci

# Copia o resto do código fonte
COPY . .

# Gera o build de produção
RUN npm run build

# Expõe a porta 3000
EXPOSE 3000

# Inicia o servidor Next.js
CMD ["npm", "start"]
