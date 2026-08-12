import dotenv from 'dotenv';
dotenv.config();

const port = Number(process.env.PORT) || 3333;
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');

export const config = {
  port,
  jwtSecret: process.env.JWT_SECRET || 'barracao-gourmet-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  nodeEnv: process.env.NODE_ENV || 'development',
  publicBaseUrl,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  redisKeyPrefix: process.env.REDIS_KEY_PREFIX || 'barracao',
  // Endereco base da loja — origem de todo calculo de frete/distancia.
  // TROQUE pelo endereco real do Barracao Gourmet no .env antes de subir para producao.
  lojaEnderecoBase: process.env.LOJA_ENDERECO_BASE || 'Rua Dino Borgioli, 536, Vila Campo Grande, Sao Paulo, SP, Brasil',
  lojaEnderecoRetirada: process.env.LOJA_ENDERECO_RETIRADA || 'Rua Dino Borgioli, 536 A',
  lojaLat: Number(process.env.LOJA_LAT || -23.6798252),
  lojaLon: Number(process.env.LOJA_LON || -46.6776943),
  webhookDebounceSeconds: Number(process.env.WEBHOOK_DEBOUNCE_SECONDS || 10),
  webhookDebouncePollMs: Number(process.env.WEBHOOK_DEBOUNCE_POLL_MS || 1000),
  // IA
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || '',
  // UZapi defaults
  uzapiBaseUrl: process.env.UZAPI_BASE_URL || '',
  uzapiAdminToken: process.env.UZAPI_ADMIN_TOKEN || '',
  uzapiWebhookPath: process.env.UZAPI_WEBHOOK_PATH || '/webhook',
  uzapiWebhookMethod: (process.env.UZAPI_WEBHOOK_METHOD || 'POST').toUpperCase(),
  uzapiSendMessagePath: process.env.UZAPI_SEND_MESSAGE_PATH || '/send/text',
  // Mercado Pago
  mercadoPagoApiBaseUrl: (process.env.MERCADO_PAGO_API_BASE_URL || 'https://api.mercadopago.com').replace(/\/$/, ''),
  mercadoPagoAccessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || '',
  mercadoPagoPixExpirationMinutes: Number(process.env.MERCADO_PAGO_PIX_EXPIRATION_MINUTES || 30),
  mercadoPagoWebhookSecret: process.env.MERCADO_PAGO_WEBHOOK_SECRET || '',
  // OpenRouteService (geocodificacao + rota dirigindo para calculo de frete)
  // Valores padrao ja embutidos; o .env pode sobrescrever se necessario.
  openRouteServiceApiKey:
    process.env.OPENROUTESERVICE_API_KEY ||
    'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjkzNTY0YTU4MTBiZjQ2NGI5ZmY4NGU5NDYwNTZmY2U5IiwiaCI6Im11cm11cjY0In0=',
  openRouteServiceBaseUrl: (process.env.OPENROUTESERVICE_BASE_URL || 'https://api.openrouteservice.org').replace(/\/$/, ''),
  // AwesomeAPI: API key (header x-api-key) para a cota maior de CEP->coordenadas.
  // Registre em https://awesomeapi.com.br e defina AWESOMEAPI_API_KEY no .env.
  awesomeApiKey: process.env.AWESOMEAPI_API_KEY || process.env.AWESOMEAPI_TOKEN || '',
  // Pushover: notificacoes push para erros criticos (IA, frete, pagamento, webhook).
  // Crie a app em https://pushover.net/apps/build e pegue o token; o "user" e a chave da sua conta.
  pushoverToken: process.env.PUSHOVER_TOKEN || '',
  pushoverUser: process.env.PUSHOVER_USER || '',
};
