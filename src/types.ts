import type { WebSocket } from "ws";

/**
 * Estrutura de dados de uma volta
 */
export interface LapDataStructure {
  lapTime: number; // Tempo em milissegundos
  sectorTimes: number[]; // Tempos dos setores
  isValid: boolean; // Se a volta é válida
}

/**
 * Dados brutos recebidos do simulador (via /input)
 */
export interface RawSimulatorData {
  simNum: number; // ID do simulador (1, 2 ou 3)
  "pilot-name": string;
  car: string;
  track: string;
  lapData: LapDataStructure;
  currentLap: number;
  laps: number;
  speedNow: number;
  rpm: number;
  maxRpm: number;
  gear: number;
  gas: number; // 0-1
  brake: number; // 0-1
  fuel: number;
  maxFuel: number;
  position: number;
  sessionTimeLeft: number; // ms
  bestLap?: number; // Melhor volta em ms (opcional)
  bestTime?: number; // Alias para bestLap (opcional)
  event?: string; // Evento ou descrição adicional (opcional)
  carData?: Record<string, any>;
}

/**
 * Mensagem recebida no endpoint /input
 */
export interface InputMessage {
  type: "simulator-update";
  data: RawSimulatorData;
}

/**
 * Mensagem enviada para clientes /output
 */
export interface OutputMessage {
  type: "simulator-update";
  data: RawSimulatorData;
  timestamp: string; // ISO 8601
}

/**
 * Cliente conectado ao servidor
 */
export interface Client {
  id: string;
  ws: WebSocket;
  type: "input" | "output";
  connectedAt: Date;
  simulatorId?: number; // Para clientes input, qual simulador eles representam
  lastActivity?: Date;
}

/**
 * Estatísticas do servidor
 */
export interface ServerStats {
  inputClients: number;
  outputClients: number;
  totalMessages: number;
  uptime: number; // segundos
  activeSimulators: number[];
}

/**
 * Configuração do servidor
 */
export interface ServerConfig {
  port: number;
  host: string;
  logLevel: "debug" | "info" | "warn" | "error";
  maxReconnectAttempts: number;
  reconnectInterval: number;
}

/**
 * Log de evento
 */
export interface LogEvent {
  timestamp: Date;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  data?: any;
}
