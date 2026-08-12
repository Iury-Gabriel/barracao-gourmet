import { createClient } from 'redis';
import { config } from '../config/env';

type RedisClient = ReturnType<typeof createClient>;

const globalForRedis = globalThis as unknown as {
  redisClient?: RedisClient;
  redisReady?: boolean;
  redisConnectingPromise?: Promise<RedisClient> | null;
};

function buildRedisClient() {
  const client = createClient({ url: config.redisUrl });

  client.on('error', (error) => {
    console.error('[redis] erro:', error);
    globalForRedis.redisReady = false;
  });

  client.on('ready', () => {
    globalForRedis.redisReady = true;
    console.log('[redis] conectado');
  });

  client.on('end', () => {
    globalForRedis.redisReady = false;
    console.warn('[redis] conexao encerrada');
  });

  return client;
}

export const redis = globalForRedis.redisClient ?? buildRedisClient();
if (!globalForRedis.redisClient) {
  globalForRedis.redisClient = redis;
}

function waitForRedisReady(timeoutMs: number) {
  if (redis.isReady) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (error: unknown) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const onEnd = () => {
      cleanup();
      reject(new Error('Conexao Redis encerrada antes de ficar pronta.'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout aguardando Redis ficar pronto (${timeoutMs}ms).`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      redis.off('ready', onReady);
      redis.off('error', onError);
      redis.off('end', onEnd);
    };

    redis.on('ready', onReady);
    redis.on('error', onError);
    redis.on('end', onEnd);
  });
}

export async function connectRedisIfNeeded() {
  if (redis.isReady) return redis;

  if (globalForRedis.redisConnectingPromise) {
    return globalForRedis.redisConnectingPromise;
  }

  globalForRedis.redisConnectingPromise = (async () => {
    if (!redis.isOpen) {
      await redis.connect();
    }
    if (!redis.isReady) {
      await waitForRedisReady(5_000);
    }
    return redis;
  })()
    .finally(() => {
      globalForRedis.redisConnectingPromise = null;
    });

  return globalForRedis.redisConnectingPromise;
}

export function isRedisReady() {
  return Boolean(globalForRedis.redisReady && redis.isOpen);
}
