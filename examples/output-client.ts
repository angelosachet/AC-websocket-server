import { WebSocket } from "ws";

/**
 * Cliente de teste para receber dados do endpoint /output
 */

const SERVER_URL = process.env.WS_URL || "ws://localhost:7080/output";

interface OutputMessage {
  type: string;
  data?: any;
  timestamp?: string;
}

// Formatador de tempo de volta
function formatLapTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor((totalSeconds % 1) * 1000);

  return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds
    .toString()
    .padStart(3, "0")}`;
}

function main() {
  console.log("🖥️  Cliente OUTPUT - Display de Dados");
  console.log(`📡 Conectando em: ${SERVER_URL}\n`);

  const ws = new WebSocket(SERVER_URL);

  ws.on("open", () => {
    console.log("✅ Conectado ao servidor!");
    console.log("⏳ Aguardando dados de simuladores...\n");
  });

  ws.on("message", (data) => {
    try {
      const message: OutputMessage = JSON.parse(data.toString());

      if (message.type === "simulator-update" && message.data) {
        const sim = message.data;

        console.clear();
        console.log("═".repeat(70));
        console.log(`🏎️  SIMULADOR ${sim.simNum} - ${message.timestamp}`);
        console.log("═".repeat(70));
        console.log();

        console.log("👤 PILOTO");
        console.log(`   Nome: ${sim["pilot-name"]}`);
        console.log(`   Carro: ${sim.car}`);
        console.log(`   Pista: ${sim.track}`);
        console.log();

        console.log("🏁 VOLTA ATUAL");
        console.log(
          `   Tempo: ${formatLapTime(sim.lapData.lapTime)} ${
            sim.lapData.isValid ? "✓" : "✗ INVÁLIDA"
          }`
        );
        console.log(
          `   Setores: ${sim.lapData.sectorTimes
            .map((t: number) => formatLapTime(t))
            .join(" | ")}`
        );
        console.log(`   Volta: ${sim.currentLap} / ${sim.laps}`);
        console.log(`   Posição: ${sim.position}º`);
        console.log();

        console.log("⚙️  TELEMETRIA");
        console.log(`   Velocidade: ${sim.speedNow} km/h`);
        console.log(`   RPM: ${sim.rpm} / ${sim.maxRpm}`);
        console.log(`   Marcha: ${sim.gear}`);
        console.log(`   Acelerador: ${(sim.gas * 100).toFixed(1)}%`);
        console.log(`   Freio: ${(sim.brake * 100).toFixed(1)}%`);
        console.log(
          `   Combustível: ${sim.fuel.toFixed(1)}L / ${sim.maxFuel}L (${(
            (sim.fuel / sim.maxFuel) *
            100
          ).toFixed(1)}%)`
        );
        console.log();

        console.log("⏱️  SESSÃO");
        const sessionMinutes = Math.floor(sim.sessionTimeLeft / 60000);
        const sessionSeconds = Math.floor((sim.sessionTimeLeft % 60000) / 1000);
        console.log(
          `   Tempo restante: ${sessionMinutes}:${sessionSeconds
            .toString()
            .padStart(2, "0")}`
        );
        console.log();

        console.log("─".repeat(70));
        console.log("Pressione CTRL+C para sair");
      } else if (message.type === "connected") {
        console.log(`✅ ${message.data || "Conectado"}`);
      } else if (message.type === "stats") {
        console.log("📊 Estatísticas do servidor:", message.data);
      } else {
        console.log("📥 Mensagem:", message);
      }
    } catch (error) {
      console.log("📥 Mensagem (raw):", data.toString());
    }
  });

  ws.on("close", () => {
    console.log("\n❌ Desconectado do servidor");
    process.exit(0);
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
