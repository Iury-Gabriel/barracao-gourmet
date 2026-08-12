import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { config } from '../config/env';
import { uploadsDir } from '../lib/uploads';
import { buildPublicUrl } from '../lib/url';
import { notificarErroCritico } from '../lib/alertas';

function onlyDigits(value?: string) {
  return String(value || '').replace(/\D/g, '');
}

// Remove todo espaco (inclusive interno) do e-mail. Corretores de teclado no celular
// as vezes inserem espaco depois de "." (ex: "nome. sobrenome@gmail. com"), o que faz
// o Mercado Pago recusar o e-mail como invalido.
function sanitizeEmail(email?: string | null) {
  let email2 = String(email || '').trim().replace(/\s+/g, '');
  // Corrige typos comuns e inequivocos de TLD (nenhum destes existe de verdade,
  // entao e seguro corrigir sem risco de "consertar" um dominio valido por engano).
  email2 = email2.replace(/\.(con|comm)$/i, '.com');
  return email2;
}

function parseJsonSafe(text: string) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function toSingleLine(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function resumirErroMercadoPago(details: any) {
  if (!details || typeof details !== 'object') {
    return '';
  }

  const partes: string[] = [];

  const errors = Array.isArray(details?.errors) ? details.errors : [];
  for (const item of errors) {
    if (!item || typeof item !== 'object') continue;
    const code = toSingleLine(item.code || item.error || item.type || '');
    const description = toSingleLine(item.description || item.message || item.detail || '');
    if (code && description) {
      partes.push(`${code}: ${description}`);
      continue;
    }
    if (code) {
      partes.push(code);
      continue;
    }
    if (description) {
      partes.push(description);
    }
  }

  const causes = Array.isArray(details?.cause) ? details.cause : [];
  for (const item of causes) {
    if (!item || typeof item !== 'object') continue;
    const code = toSingleLine(item.code || '');
    const description = toSingleLine(item.description || '');
    if (code && description) {
      partes.push(`${code}: ${description}`);
      continue;
    }
    if (code) {
      partes.push(code);
      continue;
    }
    if (description) {
      partes.push(description);
    }
  }

  const fallbackMessage = toSingleLine(
    details?.message ||
    details?.error ||
    details?.data?.message ||
    details?.data?.description ||
    ''
  );
  if (fallbackMessage) {
    partes.push(fallbackMessage);
  }

  return Array.from(new Set(partes.filter(Boolean))).join(' | ');
}

// Mensagens amigaveis para falhas na criacao da order PIX (status_detail do pagamento
// dentro da order, ex: quando o Mercado Pago recusa por email invalido).
const PIX_FALHA_STATUS_DETAIL_MAP: Record<string, string> = {
  invalid_payer_email: 'O e-mail informado parece invalido (confira se nao tem erro de digitacao, tipo ".con" em vez de ".com").',
};

function mensagemFalhaPix(orderJson: any): string | undefined {
  const statusDetail = orderJson?.transactions?.payments?.[0]?.status_detail;
  return statusDetail ? PIX_FALHA_STATUS_DETAIL_MAP[statusDetail] : undefined;
}

function montarErroMercadoPago(messageBase: string, details: any, extra?: Record<string, any>, mensagemAmigavel?: string) {
  const resumo = resumirErroMercadoPago(details);
  const message = mensagemAmigavel || (resumo ? `${messageBase} Motivo: ${resumo}` : messageBase);

  console.error('[mercado-pago] erro de integracao', {
    messageBase,
    resumo,
    mensagemAmigavel,
    extra: extra || {},
    details,
  });

  notificarErroCritico('pagamento', `Mercado Pago: ${messageBase}${resumo ? ` Motivo: ${resumo}` : ''}`, {
    detalhes: { resumo, ...extra },
  });

  return {
    status: 502,
    message,
    details,
  };
}

function toMoneyString(value: number) {
  return Number(Number(value || 0).toFixed(2)).toFixed(2);
}

function splitNomeCompleto(nomeCompleto?: string) {
  const nomeNormalizado = String(nomeCompleto || '').trim().replace(/\s+/g, ' ');
  if (!nomeNormalizado) {
    return { firstName: 'Cliente', lastName: 'Gourmet' };
  }

  const partes = nomeNormalizado.split(' ');
  const firstName = (partes.shift() || 'Cliente').slice(0, 80);
  const lastName = (partes.join(' ') || 'Gourmet').slice(0, 80);
  return { firstName, lastName };
}

function parsePhone(value?: string) {
  const digits = onlyDigits(value);
  if (digits.length < 10) return null;

  const normalized = digits.length > 11 ? digits.slice(-11) : digits;
  return {
    area_code: normalized.slice(0, 2),
    number: normalized.slice(2),
  };
}

function parseAddress(enderecoEntrega?: string, cepEntrega?: string) {
  const valor = String(enderecoEntrega || '').trim();
  if (!valor) return undefined;

  const partes = valor.split(',').map((item) => item.trim()).filter(Boolean);
  const streetName = (partes[0] || valor).slice(0, 120);
  const streetNumberRaw = onlyDigits(partes[1] || '');
  const neighborhood = (partes[2] || 'Centro').slice(0, 120);
  const city = (partes[3] || 'Sao Paulo').slice(0, 120);
  const state = (partes[4] || 'SP').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'SP';

  return {
    zip_code: onlyDigits(cepEntrega).slice(0, 8) || undefined,
    street_name: streetName,
    street_number: streetNumberRaw || '0',
    neighborhood,
    city,
    state,
  };
}

function getNestedValue(source: any, pathName: string) {
  return pathName.split('.').reduce((cursor: any, key) => {
    if (!cursor || typeof cursor !== 'object') return undefined;
    return cursor[key];
  }, source);
}

function getFirstString(source: any, paths: string[]) {
  for (const pathName of paths) {
    const value = getNestedValue(source, pathName);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

async function salvarQrCodePix(orderReference: string, qrCodePayload?: string, qrCodeBase64?: string) {
  if (!qrCodePayload && !qrCodeBase64) return undefined;

  const pixDir = path.join(uploadsDir, 'pix');
  if (!fs.existsSync(pixDir)) {
    fs.mkdirSync(pixDir, { recursive: true });
  }

  const safeReference = orderReference.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'pedido';
  const fileName = `${safeReference}-${Date.now()}.png`;
  const filePath = path.join(pixDir, fileName);

  if (qrCodeBase64) {
    const normalizedBase64 = qrCodeBase64.replace(/^data:image\/png;base64,/i, '');
    fs.writeFileSync(filePath, Buffer.from(normalizedBase64, 'base64'));
  } else if (qrCodePayload) {
    await QRCode.toFile(filePath, qrCodePayload, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 512,
    });
  }

  return buildPublicUrl(`/uploads/pix/${fileName}`);
}

function extractMercadoPagoOrderSnapshot(orderResponse: any, fallbackReference?: string) {
  const payment = Array.isArray(orderResponse?.transactions?.payments) ? orderResponse.transactions.payments[0] : undefined;
  const orderId = String(orderResponse?.id || '');
  const paymentId = String(payment?.id || '');
  const qrCodePayload = getFirstString(payment, [
    'payment_method.qr_code',
    'payment_method.reference',
  ]);
  const qrCodeBase64 = getFirstString(payment, [
    'payment_method.qr_code_base64',
  ]);

  return {
    orderId,
    paymentId,
    status: String(payment?.status || orderResponse?.status || ''),
    statusDetail: String(payment?.status_detail || orderResponse?.status_detail || ''),
    qrCodePayload,
    qrCodeBase64,
    expirationDate: getFirstString(payment, ['date_of_expiration']),
    ticketUrl: getFirstString(payment, ['payment_method.ticket_url']),
    referenceForQr: fallbackReference || orderId || `pix-${Date.now()}`,
    rawResponse: orderResponse,
  };
}

export function isMercadoPagoConfigured() {
  return Boolean(config.mercadoPagoAccessToken);
}

export function getMercadoPagoWebhookUrl() {
  return buildPublicUrl('/api/webhook/mercado-pago');
}

// Mensagens amigaveis a partir do status_detail de recusa do Mercado Pago.
export function mensagemRecusaCartao(status?: string, statusDetail?: string) {
  const mapa: Record<string, string> = {
    cc_rejected_bad_filled_card_number: 'Numero do cartao invalido. Confira os dados.',
    cc_rejected_bad_filled_date: 'Data de validade invalida. Confira os dados.',
    cc_rejected_bad_filled_security_code: 'Codigo de seguranca (CVV) invalido.',
    cc_rejected_bad_filled_other: 'Dados do cartao invalidos. Confira e tente de novo.',
    cc_rejected_insufficient_amount: 'Cartao sem saldo/limite suficiente.',
    cc_rejected_high_risk: 'Pagamento recusado pela analise de risco. Tente outro cartao.',
    cc_rejected_call_for_authorize: 'Autorize o pagamento com o seu banco e tente novamente.',
    cc_rejected_card_disabled: 'Cartao desabilitado. Contate o seu banco.',
    cc_rejected_duplicated_payment: 'Pagamento duplicado. Aguarde alguns minutos.',
    cc_rejected_max_attempts: 'Muitas tentativas. Tente novamente mais tarde.',
    cc_rejected_other_reason: 'Pagamento recusado pelo emissor. Tente outro cartao.',
  };
  if (statusDetail && mapa[statusDetail]) return mapa[statusDetail];
  if (status === 'in_process') return 'Pagamento em analise. Avisaremos quando for aprovado.';
  return 'Pagamento com cartao nao aprovado. Tente outro cartao ou forma de pagamento.';
}

// Cria um pagamento com cartao (Checkout Transparente) usando o token gerado no navegador.
// Busca um customer do Mercado Pago pelo email (nao cria).
export async function buscarCustomerMercadoPago(email: string): Promise<string | null> {
  const mail = sanitizeEmail(email).toLowerCase();
  if (!isMercadoPagoConfigured() || !mail) return null;
  try {
    const res = await fetch(`${config.mercadoPagoApiBaseUrl}/v1/customers/search?email=${encodeURIComponent(mail)}`, {
      headers: { Authorization: `Bearer ${config.mercadoPagoAccessToken}` },
    });
    if (!res.ok) return null;
    const data: any = await res.json().catch(() => null);
    const id = data?.results?.[0]?.id;
    return id ? String(id) : null;
  } catch (err) {
    console.error('[mercado-pago] falha ao buscar customer', { err });
    return null;
  }
}

// Busca ou cria um customer do Mercado Pago pelo email (para salvar cartoes).
export async function buscarOuCriarCustomerMercadoPago(email: string, nome?: string): Promise<string | null> {
  const mail = sanitizeEmail(email).toLowerCase();
  if (!isMercadoPagoConfigured() || !mail) return null;
  const existente = await buscarCustomerMercadoPago(mail);
  if (existente) return existente;
  try {
    const res = await fetch(`${config.mercadoPagoApiBaseUrl}/v1/customers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.mercadoPagoAccessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: mail, ...(nome ? { first_name: nome } : {}) }),
    });
    const data: any = await res.json().catch(() => null);
    if (res.ok && data?.id) return String(data.id);
    // Se ja existir (corrida), tenta buscar de novo.
    return await buscarCustomerMercadoPago(mail);
  } catch (err) {
    console.error('[mercado-pago] falha ao criar customer', { err });
    return null;
  }
}

// Salva um cartao (token) em um customer do Mercado Pago. Retorna o card_id ou null.
export async function salvarCartaoNoCustomer(customerId: string, token: string): Promise<string | null> {
  if (!isMercadoPagoConfigured() || !customerId || !token) return null;
  try {
    const res = await fetch(`${config.mercadoPagoApiBaseUrl}/v1/customers/${customerId}/cards`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.mercadoPagoAccessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data: any = await res.json().catch(() => null);
    if (res.ok && data?.id) {
      console.log('[mercado-pago] cartao salvo no customer', { customerId, cardId: data.id, lastFour: data.last_four_digits });
      return String(data.id);
    }
    console.warn('[mercado-pago] falha ao salvar cartao no customer', { customerId, status: res.status, body: data });
    return null;
  } catch (err) {
    console.error('[mercado-pago] erro ao salvar cartao no customer', { customerId, err });
    return null;
  }
}

// Lista os cartoes salvos de um customer.
export async function listarCartoesCustomerMercadoPago(customerId: string) {
  if (!isMercadoPagoConfigured() || !customerId) return [];
  try {
    const res = await fetch(`${config.mercadoPagoApiBaseUrl}/v1/customers/${customerId}/cards`, {
      headers: { Authorization: `Bearer ${config.mercadoPagoAccessToken}` },
    });
    if (!res.ok) return [];
    const data: any = await res.json().catch(() => []);
    const arr = Array.isArray(data) ? data : [];
    return arr.map((c: any) => ({
      id: String(c.id),
      lastFour: String(c.last_four_digits || ''),
      brand: String(c.payment_method?.name || c.payment_method?.id || ''),
      paymentMethodId: String(c.payment_method?.id || ''),
      issuerId: c.issuer?.id ? String(c.issuer.id) : undefined,
      expMonth: c.expiration_month,
      expYear: c.expiration_year,
    }));
  } catch (err) {
    console.error('[mercado-pago] falha ao listar cartoes', { err });
    return [];
  }
}

export async function criarPagamentoCartaoMercadoPago(input: {
  token: string;
  paymentMethodId: string;
  issuerId?: string | number;
  installments?: number;
  transactionAmount: number;
  descricao: string;
  payerEmail: string;
  payerNome?: string;
  payerDocType?: string;
  payerDocNumber?: string;
  customerId?: string;
  externalReference?: string;
}) {
  if (!isMercadoPagoConfigured()) {
    throw { status: 500, message: 'Integracao Mercado Pago nao configurada. Defina MERCADO_PAGO_ACCESS_TOKEN.' };
  }
  if (!input.token) {
    throw { status: 400, message: 'Token do cartao ausente.' };
  }

  const doc = onlyDigits(input.payerDocNumber);
  const payerEmail = sanitizeEmail(input.payerEmail);
  // Com customerId, associamos o pagamento ao cliente (salva o cartao / usa cartao salvo).
  const payer: any = input.customerId
    ? { type: 'customer', id: input.customerId, ...(payerEmail ? { email: payerEmail } : {}) }
    : { email: payerEmail, ...(doc ? { identification: { type: input.payerDocType || 'CPF', number: doc } } : {}) };

  const body: any = {
    transaction_amount: Number(input.transactionAmount.toFixed(2)),
    token: input.token,
    description: input.descricao,
    installments: Number(input.installments) || 1,
    payment_method_id: input.paymentMethodId,
    payer,
    ...(input.externalReference ? { external_reference: input.externalReference } : {}),
    ...(input.issuerId ? { issuer_id: Number(input.issuerId) } : {}),
  };

  const response = await fetch(`${config.mercadoPagoApiBaseUrl}/v1/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.mercadoPagoAccessToken}`,
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const data: any = parseJsonSafe(text);

  if (!response.ok) {
    console.error('[mercado-pago] falha ao criar pagamento com cartao', {
      status: response.status,
      body: text.slice(0, 400),
    });
    // Recusa de cartao (saldo, dados invalidos etc.) e rotina — nao alerta.
    // So alerta quando o proprio Mercado Pago responde com erro de integracao (5xx).
    if (response.status >= 500) {
      notificarErroCritico('pagamento', 'Mercado Pago retornou erro de servidor ao criar pagamento com cartao.', {
        detalhes: { status: response.status, body: text.slice(0, 400) },
      });
    }
    throw {
      status: 400,
      message: data?.message || mensagemRecusaCartao(data?.status, data?.status_detail),
    };
  }

  return {
    paymentId: String(data.id),
    status: String(data.status || ''),
    statusDetail: String(data.status_detail || ''),
    rawResponse: data,
  };
}

export async function criarCobrancaPixMercadoPago(input: {
  nomeCliente: string;
  telefoneCliente?: string;
  emailCliente: string;
  documentoCliente?: string;
  cepEntrega?: string;
  enderecoEntrega?: string;
  total: number;
  descricao: string;
  externalReference: string;
}) {
  if (!config.mercadoPagoAccessToken) {
    throw {
      status: 500,
      message: 'Integracao Mercado Pago nao configurada. Defina MERCADO_PAGO_ACCESS_TOKEN.',
    };
  }

  const emailCliente = sanitizeEmail(input.emailCliente).toLowerCase();
  if (!emailCliente) {
    throw { status: 400, message: 'Email do cliente obrigatorio para gerar PIX.' };
  }

  const { firstName, lastName } = splitNomeCompleto(input.nomeCliente);
  const phone = parsePhone(input.telefoneCliente);
  const identificationNumber = onlyDigits(input.documentoCliente);
  const address = parseAddress(input.enderecoEntrega, input.cepEntrega);
  const idempotencyKey = crypto.randomUUID();

  const payer: Record<string, any> = {
    email: emailCliente,
    first_name: firstName,
  };

  if (lastName) {
    payer.last_name = lastName;
  }
  if (phone) {
    payer.phone = phone;
  }
  if (address) {
    payer.address = address;
  }
  if (identificationNumber.length === 11) {
    payer.identification = {
      type: 'CPF',
      number: identificationNumber,
    };
  }

  const response = await fetch(`${config.mercadoPagoApiBaseUrl}/v1/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.mercadoPagoAccessToken}`,
      'X-Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      type: 'online',
      external_reference: input.externalReference,
      processing_mode: 'automatic',
      total_amount: toMoneyString(input.total),
      description: String(input.descricao || '').slice(0, 150),
      payer,
      transactions: {
        payments: [
          {
            amount: toMoneyString(input.total),
            payment_method: {
              id: 'pix',
              type: 'bank_transfer',
            },
            expiration_time: `PT${Math.max(config.mercadoPagoPixExpirationMinutes, 1)}M`,
          },
        ],
      },
    }),
  });

  const rawText = await response.text();
  const json = parseJsonSafe(rawText);

  if (!response.ok) {
    throw montarErroMercadoPago(
      `Falha ao criar cobranca PIX no Mercado Pago: status ${response.status}.`,
      json,
      {
        endpoint: '/v1/orders',
        externalReference: input.externalReference,
        total: input.total,
        emailCliente,
      },
      mensagemFalhaPix(json),
    );
  }

  const snapshot = extractMercadoPagoOrderSnapshot(json, input.externalReference);

  if (!snapshot.orderId) {
    throw montarErroMercadoPago(
      'Mercado Pago nao retornou o identificador da order PIX.',
      json,
      {
        endpoint: '/v1/orders',
        externalReference: input.externalReference,
      },
    );
  }
  if (!snapshot.qrCodePayload && !snapshot.qrCodeBase64) {
    throw montarErroMercadoPago(
      'Mercado Pago nao retornou o codigo PIX nem a imagem do QR Code.',
      json,
      {
        endpoint: '/v1/orders',
        orderId: snapshot.orderId,
        externalReference: input.externalReference,
      },
    );
  }

  const qrCodeImageUrl = await salvarQrCodePix(snapshot.referenceForQr, snapshot.qrCodePayload, snapshot.qrCodeBase64);

  return {
    orderId: snapshot.orderId,
    paymentId: snapshot.paymentId,
    status: snapshot.status,
    statusDetail: snapshot.statusDetail,
    rawResponse: snapshot.rawResponse,
    pix: {
      payload: snapshot.qrCodePayload,
      qrCodeBase64: snapshot.qrCodeBase64 ? `data:image/png;base64,${snapshot.qrCodeBase64.replace(/^data:image\/png;base64,/i, '')}` : undefined,
      qrCodeImageUrl,
      expirationDate: snapshot.expirationDate,
      ticketUrl: snapshot.ticketUrl,
    },
  };
}

export async function consultarCobrancaMercadoPago(orderId: string) {
  if (!config.mercadoPagoAccessToken) {
    throw {
      status: 500,
      message: 'Integracao Mercado Pago nao configurada. Defina MERCADO_PAGO_ACCESS_TOKEN.',
    };
  }

  const response = await fetch(`${config.mercadoPagoApiBaseUrl}/v1/orders/${orderId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.mercadoPagoAccessToken}`,
    },
  });

  const rawText = await response.text();
  const json = parseJsonSafe(rawText);

  if (!response.ok) {
    throw montarErroMercadoPago(
      `Falha ao consultar order PIX no Mercado Pago: status ${response.status}.`,
      json,
      {
        endpoint: `/v1/orders/${orderId}`,
        orderId,
      },
    );
  }

  const snapshot = extractMercadoPagoOrderSnapshot(json, orderId);
  const qrCodeImageUrl =
    snapshot.qrCodePayload || snapshot.qrCodeBase64
      ? await salvarQrCodePix(snapshot.referenceForQr, snapshot.qrCodePayload, snapshot.qrCodeBase64)
      : undefined;

  return {
    orderId: snapshot.orderId,
    paymentId: snapshot.paymentId,
    status: snapshot.status,
    statusDetail: snapshot.statusDetail,
    rawResponse: snapshot.rawResponse,
    pix: {
      payload: snapshot.qrCodePayload,
      qrCodeBase64: snapshot.qrCodeBase64 ? `data:image/png;base64,${snapshot.qrCodeBase64.replace(/^data:image\/png;base64,/i, '')}` : undefined,
      qrCodeImageUrl,
      expirationDate: snapshot.expirationDate,
      ticketUrl: snapshot.ticketUrl,
    },
  };
}

export async function consultarPagamentoMercadoPago(paymentId: string) {
  if (!config.mercadoPagoAccessToken) {
    throw {
      status: 500,
      message: 'Integracao Mercado Pago nao configurada. Defina MERCADO_PAGO_ACCESS_TOKEN.',
    };
  }

  const response = await fetch(`${config.mercadoPagoApiBaseUrl}/v1/payments/${paymentId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.mercadoPagoAccessToken}`,
    },
  });

  const rawText = await response.text();
  const json = parseJsonSafe(rawText);

  if (!response.ok) {
    throw montarErroMercadoPago(
      `Falha ao consultar payment no Mercado Pago: status ${response.status}.`,
      json,
      {
        endpoint: `/v1/payments/${paymentId}`,
        paymentId,
      },
    );
  }

  return {
    id: String(json?.id || ''),
    status: String(json?.status || ''),
    statusDetail: String(json?.status_detail || ''),
    externalReference: String(json?.external_reference || ''),
    orderId: String(json?.order?.id || json?.order_id || ''),
    rawResponse: json,
  };
}

export async function gerarQrCodePix(input: {
  payload: string;
  reference: string;
}) {
  const payload = String(input.payload || '').trim();
  if (!payload) {
    throw new Error('Payload PIX obrigatorio para gerar QR Code.');
  }

  const qrCodeImageUrl = await salvarQrCodePix(input.reference, payload, undefined);
  if (!qrCodeImageUrl) {
    throw new Error('Nao foi possivel gerar a imagem do QR Code.');
  }

  return { qrCodeImageUrl };
}
