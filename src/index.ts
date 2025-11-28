import { WebSocketSimulatorServer } from "./server.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";

/**
 * Ponto de entrada do servidor
 */
async function main() {
  logger.info("=".repeat(60));
  logger.info("🏎️  WebSocket Simulator Server");
  logger.info("=".repeat(60));

  // Carregar configuração
  const config = loadConfig();
  logger.info("Configuração carregada", config);

  // Criar servidor
  const server = new WebSocketSimulatorServer(config);

  // Tratar sinais de parada
  process.on("SIGINT", async () => {
    logger.info("\n⏹️  Recebido SIGINT, parando servidor...");
    await server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logger.info("\n⏹️  Recebido SIGTERM, parando servidor...");
    await server.stop();
    process.exit(0);
  });

  // Tratar erros não capturados
  process.on("uncaughtException", (error) => {
    logger.error("Erro não capturado", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("Promise rejeitada não tratada", { reason });
    process.exit(1);
  });

  // Iniciar servidor
  try {
    await server.start();

    // Log periódico de estatísticas (a cada 60 segundos)
    setInterval(() => {
      const stats = server.getStats();
      logger.info("📊 Estatísticas", stats);
    }, 60000);
  } catch (error) {
    logger.error("Erro ao iniciar servidor", {
      error: (error as Error).message,
    });
    process.exit(1);
  }
}

// Executar
main().catch((error) => {
  logger.error("Erro fatal", { error: error.message });
  process.exit(1);
});
