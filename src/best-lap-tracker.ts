import { promises as fs } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
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
