import { WebSocket } from "ws";

/**
 * Cliente de teste para enviar dados simulados ao endpoint /input
 */

const SERVER_URL = process.env.WS_URL || "ws://localhost:7080/input";
const SIMULATOR_ID = parseInt(process.env.SIM_ID || "1");
const INTERVAL = parseInt(process.env.INTERVAL || "1000");

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

// Dados simulados
function generateSimulatorData(): SimulatorData {
  const lapTime = 80000 + Math.random() * 10000;
  const sector1 = 25000 + Math.random() * 3000;
  const sector2 = 28000 + Math.random() * 3000;
  const sector3 = lapTime - sector1 - sector2;

  return {
    simNum: SIMULATOR_ID,
    "pilot-name": `Piloto ${SIMULATOR_ID}`,
    car:
      ["Ferrari 458", "Porsche 911", "McLaren 720S"][SIMULATOR_ID - 1] ||
      "Generic Car",
    track: "Interlagos",
    lapData: {
      lapTime: Math.floor(lapTime),
      sectorTimes: [
        Math.floor(sector1),
        Math.floor(sector2),
        Math.floor(sector3),
      ],
      isValid: Math.random() > 0.1, // 90% de voltas válidas
    },
    currentLap: Math.floor(Math.random() * 15) + 1,
    laps: 20,
    speedNow: Math.floor(Math.random() * 150) + 100, // 100-250 km/h
    rpm: Math.floor(Math.random() * 3000) + 5000, // 5000-8000 RPM
    maxRpm: 8000,
    gear: Math.floor(Math.random() * 6) + 1, // 1-6
    gas: Math.random(), // 0-1
    brake: Math.random() * 0.3, // 0-0.3
    fuel: 50 + Math.random() * 50, // 50-100L
    maxFuel: 100,
    position: SIMULATOR_ID,
    sessionTimeLeft: 1800000, // 30 minutos
  };
}

function main() {
  console.log(`🏎️  Cliente INPUT - Simulador ${SIMULATOR_ID}`);
  console.log(`📡 Conectando em: ${SERVER_URL}`);
  console.log(`⏱️  Intervalo: ${INTERVAL}ms\n`);

  const ws = new WebSocket(SERVER_URL);

  ws.on("open", () => {
    console.log("✅ Conectado ao servidor!\n");

    // Enviar dados periodicamente
    const interval = setInterval(() => {
      const data = generateSimulatorData();

      const message = {
        type: "simulator-update",
        data,
      };

      ws.send(JSON.stringify(message));

      console.log(
        `📤 [${new Date().toISOString()}] Enviado: Volta ${data.currentLap}/${
          data.laps
        } - ${(data.lapData.lapTime / 1000).toFixed(3)}s - ${data.speedNow}km/h`
      );
    }, INTERVAL);

    ws.on("close", () => {
      console.log("\n❌ Desconectado do servidor");
      clearInterval(interval);
      process.exit(0);
    });
  });

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log("📥 Mensagem do servidor:", message);
    } catch (error) {
      console.log("📥 Mensagem do servidor:", data.toString());
    }
  });

  ws.on("error", (error) => {
    console.error("❌ Erro:", error.message);
  });

  // Tratar CTRL+C
  process.on("SIGINT", () => {
    console.log("\n\n⏹️  Parando cliente...");
    ws.close();
  });
}

main();
