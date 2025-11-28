# 🏎️ WebSocket Simulator Server

Servidor WebSocket central para distribuição em tempo real de dados de simuladores de corrida entre múltiplos PCs.

## 📋 Visão Geral

Este servidor implementa um sistema de comunicação bidirecional:

- **`/input`**: Endpoint para **receber** dados de simuladores
- **`/output`**: Endpoint para **distribuir** dados para displays/clientes

```
┌──────────────────────────────────────────────┐
│      Servidor Central WebSocket              │
│   • Porta: 8080                              │
│   • /input  - Recebe dados                   │
│   • /output - Distribui dados                │
└──────────────────────────────────────────────┘
           ▲                      │
           │                      │
    /input │                      │ /output
           │                      │
    ┌──────┴──────┬───────────────┴──────────┐
    │             │                          │
    ▼             ▼                          ▼
  PC 1          PC 2                       PC 3
(Sim 1)       (Sim 2)                   (Display)
```

## 🚀 Instalação

```bash
# Instalar dependências
npm install

# Criar arquivo .env (opcional)
cp .env.example .env
```

## ⚙️ Configuração

Edite `.env` ou use variáveis de ambiente:

```env
PORT=8080              # Porta do servidor
HOST=0.0.0.0          # Interface de rede
LOG_LEVEL=info        # debug | info | warn | error
```

## 🎯 Executar

### Modo Desenvolvimento (com hot reload)

```bash
npm run dev
```

### Modo Produção

```bash
# Build
npm run build

# Executar
npm start
```

## 📡 Endpoints

### WebSocket

- **`ws://localhost:8080/input`** - Recebe dados de simuladores
- **`ws://localhost:8080/output`** - Envia dados para clientes

### HTTP

- **`http://localhost:8080/health`** - Health check
- **`http://localhost:8080/stats`** - Estatísticas em tempo real

## 📊 Formato de Dados

### Mensagem INPUT (Simulador → Servidor)

```json
{
  "type": "simulator-update",
  "data": {
    "simNum": 1,
    "pilot-name": "João Silva",
    "car": "Ferrari 458",
    "track": "Interlagos",
    "lapData": {
      "lapTime": 85234,
      "sectorTimes": [25000, 30000, 30234],
      "isValid": true
    },
    "currentLap": 5,
    "laps": 10,
    "speedNow": 250,
    "rpm": 7500,
    "maxRpm": 8000,
    "gear": 6,
    "gas": 0.85,
    "brake": 0,
    "fuel": 65.5,
    "maxFuel": 100,
    "position": 2,
    "sessionTimeLeft": 300000
  }
}
```

### Mensagem OUTPUT (Servidor → Clientes)

Mesma estrutura do INPUT, mas com timestamp adicionado:

```json
{
  "type": "simulator-update",
  "data": { ... },
  "timestamp": "2025-11-24T12:34:56.789Z"
}
```

## 🧪 Testes

### Testar com Clientes de Exemplo

Terminal 1 - Servidor:

```bash
npm run dev
```

Terminal 2 - Cliente INPUT (Simulador 1):

```bash
npx tsx examples/input-client.ts
```

Terminal 3 - Cliente INPUT (Simulador 2):

```bash
SIM_ID=2 npx tsx examples/input-client.ts
```

Terminal 4 - Cliente OUTPUT (Display):

```bash
npx tsx examples/output-client.ts
```

### Variáveis de Ambiente para Exemplos

**input-client.ts:**

```bash
WS_URL=ws://localhost:8080/input  # URL do servidor
SIM_ID=1                          # ID do simulador (1, 2 ou 3)
INTERVAL=1000                     # Intervalo de envio em ms
```

**output-client.ts:**

```bash
WS_URL=ws://localhost:8080/output  # URL do servidor
```

## 📁 Estrutura do Projeto

```
websocket-server/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # Servidor principal
│   ├── connection-manager.ts # Gerenciador de conexões
│   ├── logger.ts             # Sistema de logs
│   ├── config.ts             # Configuração
│   └── types.ts              # Definições TypeScript
├── examples/
│   ├── input-client.ts       # Cliente de teste INPUT
│   └── output-client.ts      # Cliente de teste OUTPUT
├── package.json
├── tsconfig.json
└── README.md
```

## 🔌 Integração com Clientes

### Node.js / TypeScript

```typescript
import { WebSocket } from "ws";

// Cliente INPUT
const wsInput = new WebSocket("ws://localhost:8080/input");

wsInput.on("open", () => {
  const message = {
    type: "simulator-update",
    data: {
      simNum: 1,
      "pilot-name": "Test Driver",
      // ... resto dos dados
    },
  };
  wsInput.send(JSON.stringify(message));
});

// Cliente OUTPUT
const wsOutput = new WebSocket("ws://localhost:8080/output");

wsOutput.on("message", (data) => {
  const message = JSON.parse(data.toString());
  console.log("Dados recebidos:", message);
});
```

### Browser / React

```typescript
const ws = new WebSocket("ws://localhost:8080/output");

ws.onopen = () => {
  console.log("Conectado!");
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === "simulator-update") {
    console.log("Simulador", message.data.simNum, message.data);
  }
};
```

### Python

```python
import websockets
import json
import asyncio

async def send_data():
    uri = "ws://localhost:8080/input"
    async with websockets.connect(uri) as ws:
        data = {
            "type": "simulator-update",
            "data": {
                "simNum": 1,
                "pilot-name": "Python Driver",
                # ... resto dos dados
            }
        }
        await ws.send(json.dumps(data))

asyncio.run(send_data())
```

## 📊 Monitoramento

### Logs em Tempo Real

O servidor exibe logs coloridos no terminal:

```
[2025-11-24T12:00:00.000Z] INFO  🚀 Servidor rodando em ws://0.0.0.0:8080
[2025-11-24T12:00:05.123Z] INFO  Cliente INPUT conectado {"id":"abc-123"}
[2025-11-24T12:00:06.456Z] DEBUG Dados recebidos do simulador 1
[2025-11-24T12:00:06.457Z] DEBUG Dados enviados para 2 cliente(s) OUTPUT
```

### Estatísticas HTTP

```bash
curl http://localhost:8080/stats
```

Resposta:

```json
{
  "inputClients": 2,
  "outputClients": 3,
  "totalMessages": 1523,
  "uptime": 3600,
  "activeSimulators": [1, 2]
}
```

## 🔧 Funcionalidades

### ✅ Implementadas

- [x] Servidor WebSocket com rotas `/input` e `/output`
- [x] Gerenciamento de múltiplas conexões simultâneas
- [x] Broadcast de dados para todos os clientes OUTPUT
- [x] Validação de dados recebidos
- [x] Sistema de logs com níveis (debug, info, warn, error)
- [x] Estatísticas em tempo real
- [x] Health check HTTP
- [x] Clientes de exemplo (INPUT e OUTPUT)
- [x] Reconexão automática (cliente)
- [x] Tratamento de erros
- [x] TypeScript strict mode

### 🚧 Próximas Etapas

- [ ] Autenticação/Autorização
- [ ] Persistência de dados (banco de dados)
- [ ] Rate limiting
- [ ] Compressão de mensagens
- [ ] Suporte a WSS (WebSocket Secure)
- [ ] Dashboard web de monitoramento
- [ ] Replay de sessões gravadas
- [ ] API REST complementar

## 🐛 Troubleshooting

### Porta já em uso

```bash
# Linux/Mac
lsof -ti:8080 | xargs kill -9

# Windows
netstat -ano | findstr :8080
taskkill /PID <PID> /F
```

### Erro de conexão

- Verifique se o servidor está rodando
- Confirme a URL (ws:// não wss://)
- Verifique firewall/antivírus
- Tente usar `localhost` em vez de `0.0.0.0`

### Logs não aparecem

Ajuste o nível de log:

```bash
LOG_LEVEL=debug npm run dev
```

## 📝 Licença

MIT

## 👨‍💻 Desenvolvimento

```bash
# Type checking sem build
npm run type-check

# Compilar TypeScript
npm run build

# Limpar dist/
rm -rf dist/
```

---

**Desenvolvido para o sistema de telemetria de simuladores em tempo real** 🏎️💨
