#!/bin/bash

# Script para fazer build e push da imagem Docker para Docker Hub
# Uso: ./docker-push.sh [versão]
# Se não passar versão, usa 'latest'

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verificar se está logado no Docker e obter username
echo -e "${YELLOW}🔍 Detectando username do Docker Hub...${NC}"
DOCKER_USERNAME=$(docker info 2>/dev/null | grep -i "Username" | awk '{print $2}')

if [ -z "$DOCKER_USERNAME" ]; then
    echo -e "${RED}❌ Não está logado no Docker Hub${NC}"
    echo -e "${YELLOW}Execute: docker login${NC}"
    exit 1
fi

IMAGE_NAME="assetto-websocket-middleserver"
VERSION=${1:-"latest"}

echo -e "${BLUE}🐳 Docker Hub Push Script${NC}"
echo -e "${BLUE}=========================${NC}"
echo ""
echo -e "${GREEN}Username: ${DOCKER_USERNAME}${NC}"
echo -e "${GREEN}Image: ${IMAGE_NAME}${NC}"
echo -e "${GREEN}Version: ${VERSION}${NC}"
echo ""

# Build TypeScript
echo -e "${YELLOW}📦 Compilando TypeScript...${NC}"
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Erro ao compilar TypeScript${NC}"
    exit 1
fi

# Build da imagem Docker
echo -e "${YELLOW}🔨 Fazendo build da imagem Docker...${NC}"
docker build -t ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION} .
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Erro ao fazer build da imagem${NC}"
    exit 1
fi

# Tag como latest se for uma versão específica
if [ "$VERSION" != "latest" ]; then
    echo -e "${YELLOW}🏷️  Tagueando como latest também...${NC}"
    docker tag ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION} ${DOCKER_USERNAME}/${IMAGE_NAME}:latest
fi

# Push para Docker Hub
echo -e "${YELLOW}📤 Fazendo push para Docker Hub...${NC}"
docker push ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Erro ao fazer push${NC}"
    exit 1
fi

# Push do latest se for versão específica
if [ "$VERSION" != "latest" ]; then
    docker push ${DOCKER_USERNAME}/${IMAGE_NAME}:latest
fi

echo ""
echo -e "${GREEN}✅ Sucesso! Imagem publicada no Docker Hub${NC}"
echo ""
echo -e "${BLUE}📋 Informações:${NC}"
echo -e "   Imagem: ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}"
echo -e "   URL: https://hub.docker.com/r/${DOCKER_USERNAME}/${IMAGE_NAME}"
echo ""
echo -e "${BLUE}🚀 Para rodar em qualquer lugar:${NC}"
echo -e "   ${YELLOW}docker run -d -p 7080:7080 ${DOCKER_USERNAME}/${IMAGE_NAME}:${VERSION}${NC}"
echo ""
echo -e "${BLUE}📝 Ou com docker-compose.prod.yml:${NC}"
echo -e "   ${YELLOW}1. Edite docker-compose.prod.yml e substitua 'seu-usuario' por '${DOCKER_USERNAME}'${NC}"
echo -e "   ${YELLOW}2. Execute: docker-compose -f docker-compose.prod.yml up -d${NC}"
echo ""
