# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar package files
COPY package*.json ./
COPY tsconfig.json ./

# Instalar dependências
RUN npm ci

# Copiar source code
COPY src ./src

# Build
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar apenas dependências de produção
RUN npm ci --only=production

# Copiar build do estágio anterior
COPY --from=builder /app/dist ./dist

# Expor porta
EXPOSE 7080

# Variáveis de ambiente padrão
ENV PORT=7080
ENV HOST=0.0.0.0
ENV LOG_LEVEL=info

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:7080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Executar
CMD ["node", "dist/index.js"]
