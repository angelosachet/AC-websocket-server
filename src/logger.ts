import type { LogEvent } from "./types.js";

/**
 * Logger simples para o servidor
 */
export class Logger {
  private logLevel: "debug" | "info" | "warn" | "error";
  private history: LogEvent[] = [];
  private maxHistorySize = 1000;

  constructor(logLevel: "debug" | "info" | "warn" | "error" = "info") {
    this.logLevel = logLevel;
  }

  private shouldLog(level: LogEvent["level"]): boolean {
    const levels = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private log(level: LogEvent["level"], message: string, data?: any): void {
    if (!this.shouldLog(level)) return;

    const event: LogEvent = {
      timestamp: new Date(),
      level,
      message,
      data,
    };

    // Adicionar ao histórico
    this.history.push(event);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    // Formatar output
    const timestamp = event.timestamp.toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    const dataStr = data ? ` ${JSON.stringify(data)}` : "";

    // Cores para o terminal
    const colors = {
      debug: "\x1b[36m", // Cyan
      info: "\x1b[32m", // Green
      warn: "\x1b[33m", // Yellow
      error: "\x1b[31m", // Red
    };
    const reset = "\x1b[0m";

    console.log(
      `${colors[level]}[${timestamp}] ${levelStr}${reset} ${message}${dataStr}`
    );
  }

  debug(message: string, data?: any): void {
    this.log("debug", message, data);
  }

  info(message: string, data?: any): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: any): void {
    this.log("warn", message, data);
  }

  error(message: string, data?: any): void {
    this.log("error", message, data);
  }

  getHistory(): LogEvent[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }
}

export const logger = new Logger((process.env.LOG_LEVEL as any) || "info");
