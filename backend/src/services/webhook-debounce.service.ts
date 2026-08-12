import { config } from '../config/env';
import { connectRedisIfNeeded, redis } from '../lib/redis';
import { notificarErroCritico } from '../lib/alertas';

type TipoAgente = 'GESTAO' | 'ATENDIMENTO';

type MensagemBuffer = {
  mensagem: string;
  recebidaEm: string;
  metaMessageId?: string;
};

export type DebouncedWebhookBatch = {
  instanciaId: string;
  remetente: string;
  tipoAgente: TipoAgente;
  mensagens: string[];
  lastMetaMessageId?: string;
};

type DebounceHandler = (batch: DebouncedWebhookBatch) => Promise<void>;

const KEY_PREFIX = `${config.redisKeyPrefix}:webhook:debounce`;
const SCHEDULE_KEY = `${KEY_PREFIX}:schedule`;
const WORKER_LOCK_TTL_MS = 120_000;
const RETRY_SECONDS_ON_ERROR = 2;
const BUFFER_TTL_SECONDS = Math.max(config.webhookDebounceSeconds * 12, 120);
const WORKER_ID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const DEBOUNCE_MS = Math.max(config.webhookDebounceSeconds, 1) * 1000;

let workerStarted = false;
let debounceHandler: DebounceHandler | null = null;
let timer: NodeJS.Timeout | null = null;
let redisOperational = true;

const memoryBuffers = new Map<
  string,
  {
    mensagens: MensagemBuffer[];
    timeout?: NodeJS.Timeout;
  }
>();

function formatWaitTarget() {
  return `${Math.max(config.webhookDebounceSeconds, 1)}s`;
}

function conversationKey(input: {
  instanciaId: string;
  remetente: string;
  tipoAgente: TipoAgente;
}) {
  return `${input.instanciaId}|${input.remetente}|${input.tipoAgente}`;
}

function parseConversationKey(key: string) {
  const [instanciaId = '', remetente = '', tipo = 'ATENDIMENTO'] = String(key).split('|');
  const tipoAgente = tipo === 'GESTAO' ? 'GESTAO' : 'ATENDIMENTO';
  return { instanciaId, remetente, tipoAgente: tipoAgente as TipoAgente };
}

function getQueueKey(convKey: string) {
  return `${KEY_PREFIX}:queue:${convKey}`;
}

function getDueKey(convKey: string) {
  return `${KEY_PREFIX}:due:${convKey}`;
}

function getLockKey(convKey: string) {
  return `${KEY_PREFIX}:lock:${convKey}`;
}

async function runWorkerTick() {
  if (!debounceHandler) return;

  try {
    await connectRedisIfNeeded();
    redisOperational = true;
    const now = Date.now();
    const dueConversations = await redis.sendCommand<string[]>([
      'ZRANGEBYSCORE',
      SCHEDULE_KEY,
      '-inf',
      String(now),
      'LIMIT',
      '0',
      '20',
    ]);

    for (const convKey of dueConversations) {
      const lockKey = getLockKey(convKey);
      const lock = await redis.set(lockKey, WORKER_ID, {
        NX: true,
        PX: WORKER_LOCK_TTL_MS,
      });
      if (lock !== 'OK') continue;

      let claimedRawItems: string[] = [];
      try {
        const dueAtRaw = await redis.get(getDueKey(convKey));
        const dueAt = Number(dueAtRaw || 0);
        if (!Number.isFinite(dueAt) || dueAt > now) {
          continue;
        }

        const queueKey = getQueueKey(convKey);
        const rawItems = await redis.lRange(queueKey, 0, -1);
        claimedRawItems = rawItems;
        if (!rawItems.length) {
          await redis.multi().zRem(SCHEDULE_KEY, convKey).del(getDueKey(convKey)).exec();
          continue;
        }

        // Claim atomico: remove a conversa da fila agendada antes de chamar IA,
        // evitando reprocessamento se o lock expirar durante uma resposta mais lenta.
        await redis.multi().del(queueKey).del(getDueKey(convKey)).zRem(SCHEDULE_KEY, convKey).exec();

        const parsedItemsFull = rawItems
          .map((raw) => {
            try {
              return JSON.parse(raw) as MensagemBuffer;
            } catch {
              return null;
            }
          })
          .filter((item): item is MensagemBuffer => Boolean(item?.mensagem));

        const parsedItems = parsedItemsFull
          .map((item) => item.mensagem.trim())
          .filter(Boolean);

        if (!parsedItems.length) {
          await redis.multi().del(queueKey).del(getDueKey(convKey)).zRem(SCHEDULE_KEY, convKey).exec();
          continue;
        }

        const target = parseConversationKey(convKey);
        const firstReceivedAt = parsedItemsFull
          .map((item) => item.recebidaEm)
          .find(Boolean);

        const lastMetaMessageId = [...parsedItemsFull].reverse()
          .map((item) => item.metaMessageId)
          .find(Boolean);

        const waitedMs = firstReceivedAt
          ? Date.now() - new Date(firstReceivedAt).getTime()
          : null;

        console.log('[webhook-debounce] janela concluida, processando lote (redis)', {
          conversa: convKey,
          quantidadeMensagens: parsedItems.length,
          alvoEspera: formatWaitTarget(),
          esperaAproximadaMs: waitedMs,
        });

        await debounceHandler({
          instanciaId: target.instanciaId,
          remetente: target.remetente,
          tipoAgente: target.tipoAgente,
          mensagens: parsedItems,
          lastMetaMessageId,
        });
      } catch (error) {
        console.error('[webhook-debounce] erro ao processar lote:', error);
        notificarErroCritico('ia', 'Falha ao processar lote de mensagens do atendimento (IA nao respondeu ao cliente).', {
          detalhes: { conversa: convKey, error },
        });
        const retryAt = Date.now() + RETRY_SECONDS_ON_ERROR * 1000;
        const queueKey = getQueueKey(convKey);
        if (!claimedRawItems.length) {
          await redis
            .multi()
            .setEx(getDueKey(convKey), BUFFER_TTL_SECONDS, String(retryAt))
            .zAdd(SCHEDULE_KEY, [{ score: retryAt, value: convKey }])
            .exec();
          continue;
        }

        await redis
          .multi()
          .rPush(queueKey, claimedRawItems)
          .expire(queueKey, BUFFER_TTL_SECONDS)
          .setEx(getDueKey(convKey), BUFFER_TTL_SECONDS, String(retryAt))
          .zAdd(SCHEDULE_KEY, [{ score: retryAt, value: convKey }])
          .exec();
        console.warn('[webhook-debounce] lote reagendado para novo processamento', {
          conversa: convKey,
          retryEmSegundos: RETRY_SECONDS_ON_ERROR,
          quantidadeMensagens: claimedRawItems.length,
        });
      } finally {
        await redis.del(lockKey);
      }
    }
  } catch (error) {
    redisOperational = false;
    console.error('[webhook-debounce] tick com falha:', error);
    notificarErroCritico('sistema', 'Fila de mensagens do atendimento (Redis) com falha — respostas da IA podem estar atrasadas ou paradas.', {
      detalhes: error,
      chave: 'sistema:webhook-debounce-tick',
    });
  }
}

function enqueueInMemoryFallback(payload: {
  instanciaId: string;
  remetente: string;
  tipoAgente: TipoAgente;
  mensagem: string;
  metaMessageId?: string;
}) {
  const convKey = conversationKey(payload);
  const atual = memoryBuffers.get(convKey) || { mensagens: [] as MensagemBuffer[] };
  const isNovaConversa = !memoryBuffers.has(convKey);
  atual.mensagens.push({
    mensagem: String(payload.mensagem || '').trim(),
    recebidaEm: new Date().toISOString(),
    metaMessageId: payload.metaMessageId,
  });

  if (atual.timeout) {
    clearTimeout(atual.timeout);
    console.log('[webhook-debounce] nova mensagem recebida, reiniciando janela em memoria', {
      conversa: convKey,
      alvoEspera: formatWaitTarget(),
      quantidadeMensagensNoBuffer: atual.mensagens.length,
    });
  } else if (isNovaConversa) {
    console.log('[webhook-debounce] iniciando buffer de mensagens (memoria)', {
      conversa: convKey,
      alvoEspera: formatWaitTarget(),
    });
  }

  atual.timeout = setTimeout(async () => {
    const snapshot = memoryBuffers.get(convKey);
    if (!snapshot) return;
    memoryBuffers.delete(convKey);

    const mensagens = snapshot.mensagens
      .map((m) => String(m.mensagem || '').trim())
      .filter(Boolean);
    if (!mensagens.length || !debounceHandler) return;

    const lastMetaMessageId = [...snapshot.mensagens].reverse()
      .map((m) => m.metaMessageId)
      .find(Boolean);

    const target = parseConversationKey(convKey);
    console.warn('[webhook-debounce] janela concluida, processando lote (memoria)', {
      conversa: convKey,
      alvoEspera: formatWaitTarget(),
      quantidadeMensagens: mensagens.length,
    });
    await debounceHandler({
      instanciaId: target.instanciaId,
      remetente: target.remetente,
      tipoAgente: target.tipoAgente,
      mensagens,
      lastMetaMessageId,
    });
  }, DEBOUNCE_MS);

  memoryBuffers.set(convKey, atual);
}

export async function startWebhookDebounceWorker(handler: DebounceHandler) {
  debounceHandler = handler;

  if (workerStarted) return;
  workerStarted = true;

  try {
    await connectRedisIfNeeded();
    redisOperational = true;
    console.log('[webhook-debounce] worker iniciado');
  } catch (error) {
    redisOperational = false;
    console.error('[webhook-debounce] nao foi possivel conectar no Redis:', error);
    console.warn('[webhook-debounce] fallback em memoria ativado ate Redis voltar.');
    notificarErroCritico('sistema', 'Nao foi possivel conectar no Redis ao iniciar o worker de atendimento (rodando em modo fallback, sem persistencia).', {
      detalhes: error,
    });
  }

  timer = setInterval(() => {
    void runWorkerTick();
  }, Math.max(config.webhookDebouncePollMs, 500));
}

export async function enqueueWebhookMessage(payload: {
  instanciaId: string;
  remetente: string;
  tipoAgente: TipoAgente;
  mensagem: string;
  metaMessageId?: string;
}) {
  const messageText = String(payload.mensagem || '').trim();
  if (!messageText) return false;

  try {
    await connectRedisIfNeeded();
    redisOperational = true;
    const convKey = conversationKey(payload);
    const dueAt = Date.now() + DEBOUNCE_MS;

    const item: MensagemBuffer = {
      mensagem: messageText,
      recebidaEm: new Date().toISOString(),
      metaMessageId: payload.metaMessageId,
    };

    await redis
      .multi()
      .rPush(getQueueKey(convKey), JSON.stringify(item))
      .expire(getQueueKey(convKey), BUFFER_TTL_SECONDS)
      .setEx(getDueKey(convKey), BUFFER_TTL_SECONDS, String(dueAt))
      .zAdd(SCHEDULE_KEY, [{ score: dueAt, value: convKey }])
      .exec();

    const queueLen = await redis.lLen(getQueueKey(convKey));
    if (queueLen <= 1) {
      console.log('[webhook-debounce] iniciando buffer de mensagens (redis)', {
        conversa: convKey,
        alvoEspera: formatWaitTarget(),
      });
    } else {
      console.log('[webhook-debounce] nova mensagem recebida, reiniciando janela (redis)', {
        conversa: convKey,
        alvoEspera: formatWaitTarget(),
        quantidadeMensagensNoBuffer: queueLen,
      });
    }

    return true;
  } catch (error) {
    redisOperational = false;
    console.error('[webhook-debounce] falha no Redis ao enfileirar. Usando memoria:', error);
    notificarErroCritico('sistema', 'Redis fora do ar ao enfileirar mensagem do atendimento (usando fallback em memoria).', {
      detalhes: error,
      chave: 'sistema:redis-enqueue',
    });
    enqueueInMemoryFallback(payload);
    return true;
  }
}

export function stopWebhookDebounceWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  for (const [, state] of memoryBuffers) {
    if (state.timeout) clearTimeout(state.timeout);
  }
  memoryBuffers.clear();
  workerStarted = false;
}
