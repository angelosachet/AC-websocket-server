import { WebSocket } from "ws";
import { randomUUID } from "crypto";
import type {
  Client,
  RawSimulatorData,
  OutputMessage,
  ServerStats,
} from "./types.js";
import { logger } from "./logger.js";

/**
 * Gerenciador de conexões WebSocket
 * Mantém registro de todos os clientes INPUT e OUTPUT
 */
export class ConnectionManager {
  private clients: Map<string, Client> = new Map();
  private startTime: Date = new Date();
  private messageCount: number = 0;

  /**
   * Registra um novo cliente
   */
  addClient(ws: WebSocket, type: "input" | "output"): string {
    const id = randomUUID();
    const client: Client = {
      id,
      ws,
      type,
      connectedAt: new Date(),
      lastActivity: new Date(),
    };

    this.clients.set(id, client);
    logger.info(`Cliente ${type.toUpperCase()} conectado`, { id });

    // Configurar handlers
    ws.on("close", () => this.removeClient(id));
    ws.on("error", (error) => {
      logger.error(`Erro no cliente ${id}`, { error: error.message });
      this.removeClient(id);
    });

    return id;
  }

  /**
   * Remove um cliente
   */
  removeClient(id: string): void {
    const client = this.clients.get(id);
    if (!client) return;

    logger.info(`Cliente ${client.type.toUpperCase()} desconectado`, { id });

    try {
      client.ws.close();
    } catch (error) {
      // Ignorar erros ao fechar
    }

    this.clients.delete(id);
  }

  /**
   * Atualiza o simulatorId de um cliente INPUT
   */
  setSimulatorId(clientId: string, simulatorId: number): void {
    const client = this.clients.get(clientId);
    if (client && client.type === "input") {
      client.simulatorId = simulatorId;
      logger.debug(`Cliente ${clientId} associado ao simulador ${simulatorId}`);
    }
  }

  /**
   * Obtém cliente por ID
   */
  getClient(id: string): Client | undefined {
    return this.clients.get(id);
  }

  /**
   * Distribui dados para todos os clientes OUTPUT
   */
  broadcastToOutputs(data: RawSimulatorData): void {
    const message: OutputMessage = {
      type: "simulator-update",
      data,
      timestamp: new Date().toISOString(),
    };

    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    this.clients.forEach((client) => {
      if (client.type === "output" && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(messageStr);
          client.lastActivity = new Date();
          sentCount++;
        } catch (error) {
          logger.error(`Erro ao enviar para cliente ${client.id}`, {
            error: (error as Error).message,
          });
        }
      }
    });

    this.messageCount++;
    logger.debug(
      `Dados do simulador ${data.simNum} enviados para ${sentCount} cliente(s) OUTPUT`
    );
  }

  /**
   * Obtém estatísticas do servidor
   */
  getStats(): ServerStats {
    const inputClients = Array.from(this.clients.values()).filter(
      (c) => c.type === "input"
    );
    const outputClients = Array.from(this.clients.values()).filter(
      (c) => c.type === "output"
    );

    const activeSimulators = Array.from(
      new Set(
        inputClients
          .map((c) => c.simulatorId)
          .filter((id): id is number => id !== undefined)
      )
    );

    const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);

    return {
      inputClients: inputClients.length,
      outputClients: outputClients.length,
      totalMessages: this.messageCount,
      uptime,
      activeSimulators,
    };
  }

  /**
   * Lista todos os clientes
   */
  getAllClients(): Client[] {
    return Array.from(this.clients.values());
  }

  /**
   * Desconecta todos os clientes
   */
  disconnectAll(): void {
    logger.info("Desconectando todos os clientes");
    this.clients.forEach((client) => {
      try {
        client.ws.close();
      } catch (error) {
        // Ignorar erros
      }
    });
    this.clients.clear();
  }
}
