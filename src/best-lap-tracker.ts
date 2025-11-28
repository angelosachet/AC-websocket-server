import { promises as fs } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import chokidar from "chokidar";
import type { RawSimulatorData } from "./types.js";
import { logger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Diretório de dados (um nível acima de src/)
const DATA_DIR = join(__dirname, "..", "data");

// Cache em memória para evitar leituras/escritas excessivas
const eventCache = new Map<string, EventData>();
const pendingWrites = new Map<string, NodeJS.Timeout>();
const lastProcessedLap = new Map<string, { lap: number; timestamp: number }>();

// Configurações de throttling
const WRITE_DEBOUNCE_MS = 5000; // Espera 5s antes de salvar
const MIN_PROCESS_INTERVAL_MS = 5000; // Mínimo 5s entre processamentos do mesmo piloto

/**
 * Estrutura de registro de melhor volta
 */
interface BestLapRecord {
  pilotName: string;
  bestLapTime: number;
  car: string;
  track: string;
  timestamp: string;
  simNum: number;
}

/**
 * Estrutura do arquivo de evento
 */
interface EventData {
  eventName: string;
  createdAt: string;
  lastUpdated: string;
  pilots: Record<string, BestLapRecord>;
}

/**
 * Garante que o diretório data/ existe
 */
async function ensureDataDirectory(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    logger.error("Erro ao criar diretório data/", {
      error: (error as Error).message,
    });
  }
}

/**
 * Gera nome de arquivo seguro a partir do nome do evento
 */
function sanitizeEventName(eventName: string): string {
  return eventName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Carrega dados de um evento (com cache)
 */
async function loadEventData(eventName: string): Promise<EventData | null> {
  // Verificar cache primeiro
  if (eventCache.has(eventName)) {
    return eventCache.get(eventName)!;
  }

  const filename = sanitizeEventName(eventName);
  const filepath = join(DATA_DIR, `${filename}.json`);

  try {
    const content = await fs.readFile(filepath, "utf-8");
    const data = JSON.parse(content);

    // Armazenar no cache
    eventCache.set(eventName, data);

    return data;
  } catch (error) {
    // Arquivo não existe ou erro ao ler
    return null;
  }
}

/**
 * Salva dados de um evento (com debounce)
 */
async function saveEventData(
  eventName: string,
  data: EventData
): Promise<void> {
  // Atualizar cache imediatamente
  eventCache.set(eventName, data);

  const filename = sanitizeEventName(eventName);

  // Cancelar escrita pendente anterior
  if (pendingWrites.has(filename)) {
    clearTimeout(pendingWrites.get(filename)!);
  }

  // Agendar nova escrita com debounce
  const timeoutId = setTimeout(async () => {
    await ensureDataDirectory();
    const filepath = join(DATA_DIR, `${filename}.json`);

    try {
      await fs.writeFile(filepath, JSON.stringify(data, null, 2), "utf-8");
      logger.info(`Dados do evento salvos: ${filename}.json`);
      pendingWrites.delete(filename);
    } catch (error) {
      logger.error("Erro ao salvar dados do evento", {
        event: eventName,
        error: (error as Error).message,
      });
    }
  }, WRITE_DEBOUNCE_MS);

  pendingWrites.set(filename, timeoutId);
}

/**
 * Processa e salva o melhor lap se necessário (com throttling)
 */
export async function processBestLap(data: RawSimulatorData): Promise<void> {
  // Definir nome do evento (padrão se não fornecido)
  const eventName = data.event || "default-event";

  // Suportar tanto bestLap quanto bestTime
  const bestLapTime = data.bestLap || data.bestTime;

  // logger.info(`📥 Recebido bestLap request`, {
  //   event: eventName,
  //   pilot: data["pilot-name"],
  //   bestLap: data.bestLap,
  //   bestTime: data.bestTime,
  //   using: bestLapTime,
  // });

  // Verificar se há bestLap para salvar
  if (!bestLapTime || bestLapTime <= 0) {
    // logger.warn(`⚠️ bestLap/bestTime inválido ou não fornecido`, {
    //   bestLap: data.bestLap,
    //   bestTime: data.bestTime,
    // });
    return; // Nada a salvar
  }

  // Throttling por piloto - evitar processar o mesmo piloto muito rápido
  const pilotKey = `${eventName}:${data["pilot-name"]}`;
  const now = Date.now();
  const lastProcessed = lastProcessedLap.get(pilotKey);

  if (lastProcessed) {
    const timeSinceLastProcess = now - lastProcessed.timestamp;

    // Se processou recentemente E a volta é a mesma, ignorar
    if (
      timeSinceLastProcess < MIN_PROCESS_INTERVAL_MS &&
      lastProcessed.lap === data.bestLap
    ) {
      logger.debug(
        `⏭️ Ignorado por throttling (${timeSinceLastProcess}ms desde último processamento)`
      );
      return; // Ignorar processamento duplicado
    }
  }

  // Atualizar timestamp do último processamento
  lastProcessedLap.set(pilotKey, {
    lap: bestLapTime,
    timestamp: now,
  });

  // Carregar dados do evento (do cache se disponível)
  let eventData = await loadEventData(eventName);

  // Se não existe, criar novo
  if (!eventData) {
    logger.info(`📝 Criando novo evento: ${eventName}`);
    eventData = {
      eventName,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      pilots: {},
    };
  }

  const pilotName = data["pilot-name"];
  const existingRecord = eventData.pilots[pilotName];

  // Verificar se precisa atualizar (melhor tempo ou primeiro registro)
  const shouldUpdate =
    !existingRecord || bestLapTime < existingRecord.bestLapTime;

  if (shouldUpdate) {
    logger.info(`✅ Atualizando melhor volta`, {
      pilot: pilotName,
      newBest: bestLapTime,
      oldBest: existingRecord?.bestLapTime || "N/A",
      event: eventName,
    });

    eventData.pilots[pilotName] = {
      pilotName,
      bestLapTime: bestLapTime,
      car: data.car,
      track: data.track,
      timestamp: new Date().toISOString(),
      simNum: data.simNum,
    };

    eventData.lastUpdated = new Date().toISOString();

    // Salvar arquivo (com debounce - não salva imediatamente)
    await saveEventData(eventName, eventData);

    logger.info(
      `💾 Salvamento agendado para ${WRITE_DEBOUNCE_MS / 1000}s (debounce)`
    );
  } else {
    logger.debug(`⏭️ Volta não é melhor que a anterior`, {
      current: bestLapTime,
      best: existingRecord.bestLapTime,
    });
  }
}

/**
 * Lista todos os eventos salvos
 */
export async function listEvents(): Promise<string[]> {
  await ensureDataDirectory();

  try {
    const files = await fs.readdir(DATA_DIR);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  } catch (error) {
    logger.error("Erro ao listar eventos", {
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Obtém dados de um evento específico
 */
export async function getEventData(
  eventName: string
): Promise<EventData | null> {
  return loadEventData(eventName);
}

/**
 * Força a gravação de todos os dados pendentes
 * Útil para chamar antes de desligar o servidor
 */
export async function flushPendingWrites(): Promise<void> {
  logger.info("Forçando gravação de dados pendentes...");

  // Cancelar todos os timeouts e salvar imediatamente
  for (const [, timeoutId] of pendingWrites.entries()) {
    clearTimeout(timeoutId);
  }

  // Salvar todos os dados do cache
  const promises: Promise<void>[] = [];

  for (const [eventName, data] of eventCache.entries()) {
    const filename = sanitizeEventName(eventName);
    const filepath = join(DATA_DIR, `${filename}.json`);

    promises.push(
      fs
        .writeFile(filepath, JSON.stringify(data, null, 2), "utf-8")
        .then(() => {
          logger.info(`Dados salvos: ${filename}.json`);
        })
        .catch((error) => {
          logger.error(`Erro ao salvar ${filename}.json`, {
            error: (error as Error).message,
          });
        })
    );
  }

  await Promise.all(promises);
  pendingWrites.clear();
  logger.info("Gravação de dados pendentes concluída");
}

/**
 * Invalida o cache de um evento específico
 */
export function invalidateCache(eventName?: string): void {
  if (eventName) {
    eventCache.delete(eventName);
    logger.info(`Cache invalidado para evento: ${eventName}`);
  } else {
    eventCache.clear();
    logger.info("Cache completo invalidado");
  }
}

/**
 * Recarrega dados de um evento do filesystem
 */
export async function reloadEventData(eventName: string): Promise<void> {
  invalidateCache(eventName);
  await loadEventData(eventName);
  logger.info(`Dados recarregados para evento: ${eventName}`);
}

/**
 * Recarrega todos os eventos do filesystem
 */
export async function reloadAllEvents(): Promise<void> {
  invalidateCache(); // Limpa todo o cache

  try {
    const files = await fs.readdir(DATA_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    for (const file of jsonFiles) {
      const filepath = join(DATA_DIR, file);
      const content = await fs.readFile(filepath, "utf-8");
      const data = JSON.parse(content);

      if (data.eventName) {
        eventCache.set(data.eventName, data);
      }
    }

    logger.info(`Cache recarregado com ${jsonFiles.length} evento(s)`);
  } catch (error) {
    logger.error("Erro ao recarregar eventos", {
      error: (error as Error).message,
    });
  }
}

/**
 * Inicializa file watcher para detectar mudanças nos arquivos JSON
 */
export function initFileWatcher(): void {
  const watchPattern = join(DATA_DIR, "*.json");

  const watcher = chokidar.watch(watchPattern, {
    persistent: true,
    ignoreInitial: true,
    // Use polling for better compatibility com bind mounts / Docker volumes
    usePolling: true,
    interval: 1000,
    binaryInterval: 1000,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  logger.info(`📂 Iniciando file watcher em: ${watchPattern}`);

  watcher
    .on("change", async (filepath) => {
      const filename = filepath.split("/").pop() || "";
      logger.info(`📝 Arquivo modificado detectado: ${filename}`);

      try {
        const content = await fs.readFile(filepath, "utf-8");
        const data = JSON.parse(content);

        // Se o JSON declarar eventName, usar esse; senão inferir do nome do arquivo
        const eventName = data.eventName || filename.replace(".json", "");

        // Invalida e recarrega formalmente para manter o fluxo consistente
        invalidateCache(eventName);

        try {
          // Colocar no cache o conteúdo atualizado
          eventCache.set(eventName, data);
          logger.info(`✅ Cache atualizado para evento: ${eventName}`);
        } catch (err) {
          logger.error(`Erro ao atualizar cache para ${eventName}`, {
            error: (err as Error).message,
          });
        }
      } catch (error) {
        logger.error(`Erro ao recarregar arquivo ${filename}`, {
          error: (error as Error).message,
        });
      }
    })
    .on("unlink", (filepath) => {
      const filename = filepath.split("/").pop() || "";
      logger.info(`🗑️ Arquivo removido: ${filename}`);
      // Tentar remover do cache baseado no nome do arquivo
      const inferredName = filename.replace(".json", "");
      // Procurar por entradas cujo sanitized name bata com o arquivo
      for (const [eventName] of eventCache.entries()) {
        if (sanitizeEventName(eventName) === inferredName) {
          invalidateCache(eventName);
          break;
        }
      }
    })
    .on("error", (error) => {
      logger.error("Erro no file watcher", { error: (error as Error).message });
    })
    .on("ready", () => {
      logger.info("✅ File watcher pronto");
    });

  logger.info("🔍 File watcher iniciado para " + join(DATA_DIR, "*.json"));
}
