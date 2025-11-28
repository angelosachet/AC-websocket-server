import { WebSocket } from "ws";

/**
 * Script de teste para enviar dados simulados ao servidor WebSocket
 * Simula 3 simuladores enviando dados simultaneamente
 *
 * Uso:
 *   npx ts-node test-input-data.ts
 *   PORT=7080 npx ts-node test-input-data.ts
 */

const SERVER_URL = "ws://localhost:7080/input";
const NUM_SIMULATORS = 3;
const SEND_INTERVAL = 1; // ms entre envios

interface SimulatorData {
  simNum: number;
  "pilot-name": string;
  car: string;
  track: string;
  lapData: {
    lapTime: number;
    sectorTimes: number[];
    isValid: boolean;
  };
  currentLap: number;
  laps: number;
  speedNow: number;
  rpm: number;
  maxRpm: number;
  gear: number;
  gas: number;
  brake: number;
  fuel: number;
  maxFuel: number;
  position: number;
  sessionTimeLeft: number;
}

// Dados de configuração para cada simulador
const SIMULATORS_CONFIG = [
  {
    name: "João Silva",
    car: "Ferrari 458",
    track: "Interlagos",
  },
  {
    name: "Carlos Santos",
    car: "Porsche 911",
    track: "Interlagos",
  },
  {
    name: "Pedro Oliveira",
    car: "McLaren 720S",
    track: "Interlagos",
  },
];

// Estado de cada simulador
const simulatorState: Array<{
  currentLap: number;
  fuel: number;
  position: number;
}> = [
  { currentLap: 1, fuel: 100, position: 1 },
  { currentLap: 1, fuel: 100, position: 2 },
  { currentLap: 1, fuel: 100, position: 3 },
];

/**
 * Gera dados realistas para um simulador específico
 */
function generateSimulatorData(simNum: number): SimulatorData {
  const config = SIMULATORS_CONFIG[simNum - 1];
  const state = simulatorState[simNum - 1];

  // Simular consumo de combustível
  state.fuel = Math.max(20, state.fuel - 0.5);

  // Simular avanço de volta (aleatório)
  if (Math.random() > 0.8) {
    state.currentLap = Math.min(state.currentLap + 1, 20);
  }

  // Simular tempo de volta com pequenas variações
  const baseTime = 83000 + simNum * 2000; // Cada sim tem um ritmo base
  const variation = Math.sin(state.currentLap * 0.5) * 2000; // Variação senoidal
  const randomVariation = (Math.random() - 0.5) * 3000;
  const lapTime = baseTime + variation + randomVariation;

  const sector1 = lapTime * 0.3 + (Math.random() - 0.5) * 1000;
  const sector2 = lapTime * 0.35 + (Math.random() - 0.5) * 1000;
  const sector3 = lapTime - sector1 - sector2;

  // Simular posição (com mudanças ocasionais)
  if (Math.random() > 0.95 && state.position > 1) {
    state.position--;
  } else if (Math.random() > 0.98 && state.position < NUM_SIMULATORS) {
    state.position++;
  }

  return {
    simNum,
    "pilot-name": config.name,
    car: config.car,
    track: config.track,
    lapData: {
      lapTime: Math.floor(lapTime),
      sectorTimes: [
        Math.floor(sector1),
        Math.floor(sector2),
        Math.floor(sector3),
      ],
      isValid: Math.random() > 0.05, // 95% de voltas válidas
    },
    currentLap: state.currentLap,
    laps: 20,
    speedNow: Math.floor(100 + Math.sin(Math.random() * Math.PI) * 150), // 100-250 km/h
    rpm: Math.floor(5000 + Math.cos(Math.random() * Math.PI) * 3000), // 5000-8000 RPM
    maxRpm: 8000,
    gear: Math.floor(Math.random() * 6) + 1, // 1-6
    gas: Math.random() * 0.9 + 0.1, // 0.1-1.0
    brake: Math.random() * 0.4, // 0-0.4
    fuel: state.fuel,
    maxFuel: 100,
    position: state.position,
    sessionTimeLeft: Math.max(0, 1800000 - state.currentLap * 80000), // Decresce com voltas
  };
}

/**
 * Conecta um simulador e envia dados periodicamente
 */
function connectSimulator(simNum: number) {
  const ws = new WebSocket(SERVER_URL);
  let messageCount = 0;
  let errorCount = 0;

  ws.on("open", () => {
    console.log(
      `✅ Simulador ${simNum} (${
        SIMULATORS_CONFIG[simNum - 1].name
      }) conectado!`
    );

    const interval = setInterval(() => {
      try {
        const data = generateSimulatorData(simNum);
        const message = {
          type: "simulator-update",
          data,
        };

        ws.send(JSON.stringify(message));
        messageCount++;

        console.log(
          `📤 Sim${simNum} | Volta ${data.currentLap}/${data.laps} | ${(
            data.lapData.lapTime / 1000
          ).toFixed(3)}s | ${
            data.speedNow
          }km/h | Combustível: ${data.fuel.toFixed(1)}L | Posição: ${
            data.position
          }`
        );
      } catch (error) {
        errorCount++;
        console.error(
          `❌ Sim${simNum} erro ao enviar:`,
          (error as Error).message
        );
      }
    }, SEND_INTERVAL * NUM_SIMULATORS); // Escalonar envios

    // Tratar fechamento
    process.on("SIGINT", () => {
      clearInterval(interval);
      ws.close();
      console.log(
        `\n⏹️  Sim${simNum} desconectado | Mensagens: ${messageCount} | Erros: ${errorCount}`
      );
      process.exit(0);
    });
  });

  ws.on("error", (error) => {
    console.error(`❌ Sim${simNum} erro de conexão:`, error.message);
  });

  ws.on("close", () => {
    console.log(`🔌 Sim${simNum} desconectado do servidor`);
  });
}

/**
 * Ponto de entrada
 */
function main() {
  console.log("🏎️  Teste de Input - Múltiplos Simuladores");
  console.log("=".repeat(60));
  console.log(`📡 Servidor: ${SERVER_URL}`);
  console.log(`🚗 Simuladores: ${NUM_SIMULATORS}`);
  console.log(`⏱️  Intervalo: ${SEND_INTERVAL}ms por simulador`);
  console.log("=".repeat(60));
  console.log("");

  // Conectar cada simulador
  for (let i = 1; i <= NUM_SIMULATORS; i++) {
    setTimeout(() => {
      connectSimulator(i);
    }, i * 500); // Escalonar conexões
  }

  console.log("💡 Pressione Ctrl+C para parar\n");
}

main();
