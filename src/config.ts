import type { ServerConfig } from "./types.js";

/**
 * Carrega configuração do servidor a partir de variáveis de ambiente
 */
export function loadConfig(): ServerConfig {
  return {
    port: parseInt(process.env.PORT || "7080", 10),
    host: process.env.HOST || "0.0.0.0",
    logLevel: (process.env.LOG_LEVEL as ServerConfig["logLevel"]) || "info",
    maxReconnectAttempts: parseInt(
      process.env.MAX_RECONNECT_ATTEMPTS || "5",
      10
    ),
    reconnectInterval: parseInt(process.env.RECONNECT_INTERVAL || "3000", 10),
  };
}
