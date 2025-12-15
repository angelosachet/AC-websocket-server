import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { parse } from "url";
import type { IncomingMessage } from "http";
import type { InputMessage, RawSimulatorData } from "./types.js";
import { ConnectionManager } from "./connection-manager.js";
import { logger } from "./logger.js";
import type { ServerConfig } from "./types.js";
import {
  processBestLap,
  getEventData,
  listEvents,
  flushPendingWrites,
  reloadAllEvents,
  reloadEventData,
  initFileWatcher,
} from "./best-lap-tracker.js";

/**
 * Servidor WebSocket principal
 */
export class WebSocketSimulatorServer {
  private httpServer;
  private wss: WebSocketServer;
  private connectionManager: ConnectionManager;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.connectionManager = new ConnectionManager();

    // Criar servidor HTTP
    this.httpServer = createServer(this.handleHttpRequest.bind(this));

    // Criar WebSocket Server
    this.wss = new WebSocketServer({ noServer: true });

    // Configurar upgrade de conexão
    this.httpServer.on("upgrade", this.handleUpgrade.bind(this));

    // Configurar handler de conexão
    this.wss.on("connection", this.handleConnection.bind(this));
  }

  /**
   * Helper para obter headers completos (CORS + Content-Type)
   */
  private getHeaders(contentType = "application/json"): Record<string, string> {
    return {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Expose-Headers": "*",
      "Access-Control-Max-Age": "86400",
    };
  }

  /**
   * Trata requisições HTTP normais (para status/health check)
   */
  private handleHttpRequest(req: IncomingMessage, res: any): void {
    const parsedUrl = parse(req.url || "", true);

    // Tratar preflight requests (OPTIONS)
    if (req.method === "OPTIONS") {
      logger.info(`OPTIONS ${parsedUrl.pathname} - Sending CORS headers`);
      res.writeHead(200, this.getHeaders());
      res.end();
      return;
    }

    if (parsedUrl.pathname === "/health") {
      res.writeHead(200, this.getHeaders());
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
      return;
    }

    if (parsedUrl.pathname === "/stats") {
      const stats = this.connectionManager.getStats();
      res.writeHead(200, this.getHeaders());
      res.end(JSON.stringify(stats));
      return;
    }

    if (parsedUrl.pathname === "/events") {
      this.handleEventsRequest(req, res);
      return;
    }

    if (parsedUrl.pathname === "/reload") {
      this.handleReloadRequest(req, res);
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  }

  /**
   * Trata requisições para o endpoint /events
   */
  private handleEventsRequest(req: IncomingMessage, res: any): void {
    if (req.method === "GET") {
      // Listar todos os eventos
      listEvents()
        .then((events) => {
          res.writeHead(200, this.getHeaders());
          res.end(JSON.stringify({ events }));
        })
        .catch((error) => {
          res.writeHead(500, this.getHeaders());
          res.end(
            JSON.stringify({
              error: "Erro ao listar eventos",
              message: (error as Error).message,
            })
          );
        });
      return;
    }

    if (req.method === "POST") {
      // Obter dados de um evento específico
      let body = "";

      req.on("data", (chunk) => {
        body += chunk.toString();
      });

      req.on("end", async () => {
        try {
          const { eventName } = JSON.parse(body);

          if (!eventName) {
            res.writeHead(400, this.getHeaders());
            res.end(
              JSON.stringify({
                error: "Campo 'eventName' é obrigatório",
              })
            );
            return;
          }

          const eventData = await getEventData(eventName);

          if (!eventData) {
            res.writeHead(404, this.getHeaders());
            res.end(
              JSON.stringify({
                error: "Evento não encontrado",
                eventName,
              })
            );
            return;
          }

          res.writeHead(200, this.getHeaders());
          res.end(JSON.stringify(eventData));
        } catch (error) {
          res.writeHead(400, this.getHeaders());
          res.end(
            JSON.stringify({
              error: "JSON inválido ou erro ao processar",
              message: (error as Error).message,
            })
          );
        }
      });

      return;
    }

    // Método não permitido
    res.writeHead(405, this.getHeaders());
    res.end(JSON.stringify({ error: "Método não permitido" }));
  }

  /**
   * Trata requisições para o endpoint /reload
   */
  private handleReloadRequest(req: IncomingMessage, res: any): void {
    if (req.method === "POST") {
      let body = "";

      req.on("data", (chunk) => {
        body += chunk.toString();
      });

      req.on("end", async () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const { eventName } = data;

          if (eventName) {
            // Recarregar evento específico
            await reloadEventData(eventName);
            res.writeHead(200, this.getHeaders());
            res.end(
              JSON.stringify({
                success: true,
                message: `Evento '${eventName}' recarregado com sucesso`,
                eventName,
              })
            );
          } else {
            // Recarregar todos os eventos
            await reloadAllEvents();
            res.writeHead(200, this.getHeaders());
            res.end(
              JSON.stringify({
                success: true,
                message: "Todos os eventos recarregados com sucesso",
              })
            );
          }
        } catch (error) {
          res.writeHead(500, this.getHeaders());
          res.end(
            JSON.stringify({
              success: false,
              error: "Erro ao recarregar dados",
              message: (error as Error).message,
            })
          );
        }
      });

      return;
    }

    // Método não permitido
    res.writeHead(405, this.getHeaders());
    res.end(
      JSON.stringify({
        error: "Método não permitido. Use POST",
        usage: {
          reloadAll: "POST /reload (sem body)",
          reloadEvent: 'POST /reload {"eventName": "nome-do-evento"}',
        },
      })
    );
  }

  /**
   * Trata upgrade de conexão WebSocket
   */
  private handleUpgrade(
    request: IncomingMessage,
    socket: any,
    head: Buffer
  ): void {
    const parsedUrl = parse(request.url || "", true);
    const pathname = parsedUrl.pathname;

    logger.debug(`Tentativa de conexão em: ${pathname}`);

    // Validar path
    if (pathname !== "/input" && pathname !== "/output") {
      logger.warn(`Path inválido: ${pathname}`);
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    // Fazer upgrade
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit("connection", ws, request);
    });
  }

  /**
   * Trata nova conexão WebSocket
   */
  private handleConnection(ws: WebSocket, request: IncomingMessage): void {
    const parsedUrl = parse(request.url || "", true);
    const pathname = parsedUrl.pathname;

    if (pathname === "/input") {
      this.handleInputConnection(ws);
    } else if (pathname === "/output") {
      this.handleOutputConnection(ws);
    }
  }

  /**
   * Trata conexão INPUT (recebe dados de simuladores)
   */
  private handleInputConnection(ws: WebSocket): void {
    const clientId = this.connectionManager.addClient(ws, "input");

    ws.on("message", (data: Buffer) => {
      try {
        logger.debug("Mensagem recebida em /input", { raw: data.toString() });
        const message = JSON.parse(data.toString()) as InputMessage;

        // Validar mensagem
        if (message.type !== "simulator-update" || !message.data) {
          logger.warn("Mensagem inválida recebida em /input", { 
            message,
            esperado: { type: "simulator-update", data: "{...}" }
          });
          ws.send(JSON.stringify({
            type: "error",
            message: "Formato inválido. Esperado: {type: 'simulator-update', data: {...}}"
          }));
          return;
        }

        // Validar dados essenciais
        if (!this.validateSimulatorData(message.data)) {
          logger.warn("Dados de simulador inválidos", { 
            data: message.data,
            camposObrigatorios: ["simNum (1-3)", "pilot-name", "car", "track"]
          });
          ws.send(JSON.stringify({
            type: "error",
            message: "Dados inválidos. Campos obrigatórios: simNum (1-3), pilot-name, car, track"
          }));
          return;
        }

        // Associar simulador ao cliente
        this.connectionManager.setSimulatorId(clientId, message.data.simNum);

        logger.debug(`Dados recebidos do simulador ${message.data.simNum}`);

        // Processar e salvar melhor volta (se fornecida)
        processBestLap(message.data).catch((error) => {
          logger.error("Erro ao processar melhor volta", {
            error: (error as Error).message,
          });
        });

        // Distribuir para clientes OUTPUT
        this.connectionManager.broadcastToOutputs(message.data);
      } catch (error) {
        logger.error("Erro ao processar mensagem INPUT", {
          error: (error as Error).message,
        });
      }
    });

    // Enviar confirmação de conexão
    ws.send(
      JSON.stringify({
        type: "connected",
        message: "Conectado ao endpoint /input. Pronto para receber dados.",
      })
    );
  }

  /**
   * Trata conexão OUTPUT (envia dados para displays)
   */
  private handleOutputConnection(ws: WebSocket): void {
    this.connectionManager.addClient(ws, "output");

    // Enviar confirmação de conexão
    ws.send(
      JSON.stringify({
        type: "connected",
        message:
          "Conectado ao endpoint /output. Aguardando dados de simuladores...",
      })
    );

    // Enviar estatísticas iniciais
    const stats = this.connectionManager.getStats();
    ws.send(
      JSON.stringify({
        type: "stats",
        data: stats,
      })
    );
  }

  /**
   * Valida dados mínimos do simulador
   */
  private validateSimulatorData(data: RawSimulatorData): boolean {
    return (
      typeof data.simNum === "number" &&
      data.simNum >= 1 &&
      data.simNum <= 3 &&
      typeof data["pilot-name"] === "string" &&
      typeof data.car === "string" &&
      typeof data.track === "string"
    );
  }

  /**
   * Inicia o servidor
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.config.port, this.config.host, () => {
        logger.info(
          `🚀 Servidor WebSocket rodando em ws://${this.config.host}:${this.config.port}`
        );
        logger.info(
          `   📥 INPUT endpoint:  ws://${this.config.host}:${this.config.port}/input`
        );
        logger.info(
          `   📤 OUTPUT endpoint: ws://${this.config.host}:${this.config.port}/output`
        );
        logger.info(
          `   ❤️  Health check:   http://${this.config.host}:${this.config.port}/health`
        );
        logger.info(
          `   📊 Stats:          http://${this.config.host}:${this.config.port}/stats`
        );
        logger.info(
          `   🔄 Reload:         http://${this.config.host}:${this.config.port}/reload`
        );

        // Inicializar file watcher para hot reload automático
        initFileWatcher();

        resolve();
      });
    });
  }

  /**
   * Para o servidor
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      logger.info("Parando servidor...");

      // Salvar dados pendentes
      flushPendingWrites()
        .then(() => {
          // Desconectar todos os clientes
          this.connectionManager.disconnectAll();

          // Fechar WebSocket server
          this.wss.close(() => {
            // Fechar HTTP server
            this.httpServer.close(() => {
              logger.info("Servidor parado");
              resolve();
            });
          });
        })
        .catch((error) => {
          logger.error("Erro ao salvar dados pendentes", {
            error: (error as Error).message,
          });
          // Continuar com o shutdown mesmo com erro
          this.connectionManager.disconnectAll();
          this.wss.close(() => {
            this.httpServer.close(() => {
              resolve();
            });
          });
        });
    });
  }

  /**
   * Obtém estatísticas do servidor
   */
  getStats() {
    return this.connectionManager.getStats();
  }
}
