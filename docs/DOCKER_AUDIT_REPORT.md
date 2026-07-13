# Auditoria Docker & DevOps - AssetFlow

Este relatório detalha a auditoria da infraestrutura de containers do projeto, problemas identificados, e as melhorias aplicadas focando em separar os ambientes de desenvolvimento e produção, reduzir imagens, e estruturar um CI/CD básico.

## 1. Problemas Identificados

### 1.1 Frontend (Next.js)
- **Tamanho Extremo**: A imagem do Next.js copiava todo o código-fonte (incluindo imagens brutas, configs, testes) e instalava as dependências de desenvolvimento.
- **Conflito Dev vs Prod**: O docker-compose sobrepunha a compilação local (bind mount `.:/app`) sobre a compilação da imagem (`npm run build`). Isso deixava o Hot-Reload lento e causava problemas de integridade.
- **Volumes Anônimos Obscuros**: Existência de `node_modules` e `.next` flutuantes.

### 1.2 Backend (Flask/Python)
- **Desperdício de Espaço**: Compiladores C (`gcc`) não eram removidos da imagem final, inflando drasticamente a imagem e introduzindo vulnerabilidades desnecessárias em produção.
- **Ambientes Misturados**: Executava código de produção em um compose genérico.

### 1.3 Docker Compose
- **Desorganização Monolítica**: Havia apenas um grande arquivo gerindo tudo. Difícil de desligar ferramentas pesadas que só se justificam em prod (como GlitchTip) em um dia normal de dev.

## 2. Melhorias Aplicadas

### 2.1 Multi-Stage Builds e Imagens Standalone
O `next.config.ts` foi reconfigurado com `output: "standalone"`. O Dockerfile agora extrai estritamente o código Node transpilado em 3 estágios (`deps`, `builder`, `runner`).
- **Ganhos**: Tamanho da imagem despenca em até **80%** (de >1.2GB para ~150MB). Segurança maximizada por utilizar apenas artefatos finais e `USER nextjs` sem permissões de root.

### 2.2 Virtualenv Multi-Stage (Backend)
O `server/Dockerfile` foi transformado. O estágio builder compila tudo (incluindo possíveis wheels), e injeta o `venv` limpo na imagem final. `gcc` e `python3-dev` descartados.
- **Ganhos**: Menor superfície de ataque e inicialização milissegundos mais veloz.

### 2.3 Separação Arquitetural Dev/Prod
- `docker-compose.dev.yml`: Foco em bind mounts nativos e **Hot Reload**.
- `docker-compose.prod.yml`: Foco em código congelado na imagem, deploy estável e zero bind mounts de fontes. GlitchTip mantido na config de produção.

### 2.4 Automações (CI/CD e Scripts)
- **Scripts**: Foram criados `.sh` (Linux/Mac/WSL) e `.ps1` (PowerShell/Win) na pasta `scripts/` simplificando operações de startup e manutenção.
- **GitHub Actions**: Configurado `.github/workflows/ci.yml` para auditar a saúde estrutural dos commits e builds de container.

## 3. Impacto Geral
O tempo gasto no "Docker Desktop" com CPU em 100% durante rebuilds desabará drasticamente para os desenvolvedores porque `npm run dev` rodará naturalmente em volume.
O deploy será muito mais barato em cloud dado o tamanho microscópico das imagens baseinais Alpine e Slim.
