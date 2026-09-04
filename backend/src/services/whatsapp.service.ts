import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { config } from '../config/env';
import { uploadsDir } from '../lib/uploads';
import { transcodeParaOggOpus } from '../lib/audio';

// ===== HELPERS =====

const MIME_POR_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.amr': 'audio/amr',
};

function nomeArquivoUploads(url: string): string | null {
  const marcador = '/uploads/';
  const idx = url.indexOf(marcador);
  if (idx === -1) return null;
  return url.slice(idx + marcador.length).split('?')[0];
}

// Le os bytes da midia: prioriza o arquivo local em /uploads; cai para fetch da URL.
async function lerBytesMidia(url: string): Promise<{ buffer: Buffer; mimeType: string; ext: string } | null> {
  const filename = nomeArquivoUploads(url);
  if (filename) {
    const local = path.join(uploadsDir, filename);
    if (fs.existsSync(local)) {
      const ext = path.extname(filename).toLowerCase();
      return { buffer: fs.readFileSync(local), mimeType: MIME_POR_EXT[ext] || 'application/octet-stream', ext };
    }
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const mimeType = res.headers.get('content-type') || 'application/octet-stream';
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    return { buffer, mimeType, ext };
  } catch (err) {
    console.error('[whatsapp] falha ao ler bytes da midia', { url: url.slice(0, 80), err });
    return null;
  }
}

// Faz upload de midia para a Meta (endpoint /media) e retorna o media_id.
async function uploadMediaMeta(instancia: any, buffer: Buffer, mimeType: string, filename: string): Promise<string | null> {
  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', new Blob([buffer], { type: mimeType }), filename);

    const res = await fetch(`https://graph.facebook.com/v22.0/${instancia.metaPhoneNumberId}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${instancia.metaAccessToken}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[meta] falha no upload de midia (/media)', { status: res.status, body: body.slice(0, 300) });
      return null;
    }
    const data: any = await res.json().catch(() => null);
    return data?.id || null;
  } catch (err) {
    console.error('[meta] erro no upload de midia (/media)', { err });
    return null;
  }
}

async function enviarMidiaPorIdMeta(
  instancia: any,
  numero: string,
  tipo: 'image' | 'audio',
  mediaId: string,
  caption?: string,
) {
  const midia: Record<string, any> = { id: mediaId };
  if (tipo === 'image' && caption) midia.caption = caption;

  const res = await fetch(`https://graph.facebook.com/v22.0/${instancia.metaPhoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${instancia.metaAccessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numero,
      type: tipo,
      [tipo]: midia,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[meta] falha ao enviar ${tipo} por media_id`, { status: res.status, body: body.slice(0, 300) });
  }
  return res.ok;
}

async function getConfigIA() {
  let cfg = await prisma.configuracaoIA.findFirst();
  if (!cfg) cfg = await prisma.configuracaoIA.create({ data: {} });
  return cfg;
}

async function parseJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function normalizeHttpMethod(method: string | null | undefined, fallback = 'POST') {
  const normalized = String(method || '').trim().toUpperCase();
  return normalized || fallback;
}

function normalizePath(pathValue: string | null | undefined) {
  const raw = String(pathValue || '').trim();
  if (!raw) return '';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function normalizePhone(rawValue: string | null | undefined) {
  if (!rawValue) return '';
  let value = String(rawValue).trim();
  if (!value) return '';

  if (value.includes('@')) {
    value = value.split('@')[0];
  }

  return value.replace(/[^\d]/g, '');
}

/**
 * Reduz um numero brasileiro a uma forma canonica (DDD + 8 digitos), removendo
 * DDI 55 e o 9o digito do celular. Serve para comparar numeros que podem chegar
 * em formatos diferentes (com/sem 55, com/sem o 9).
 */
export function canonicalizarNumeroBr(raw: string | null | undefined): string {
  let d = normalizePhone(raw);
  if (!d) return '';
  // Remove DDI 55 quando ha digitos suficientes para ser um numero completo com pais.
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  // Remove o 9o digito do celular (DDD + 9 + 8 digitos -> DDD + 8 digitos).
  if (d.length === 11) d = d.slice(0, 2) + d.slice(3);
  return d;
}

/**
 * True se o remetente estiver cadastrado como numero do agente de gestao.
 * A comparacao e feita na forma canonica para tolerar variacao de formato.
 */
export async function isNumeroGestao(remetente: string | null | undefined): Promise<boolean> {
  const alvo = canonicalizarNumeroBr(remetente);
  if (!alvo) return false;
  const numeros = await prisma.numeroGestao.findMany({ select: { numero: true } });
  return numeros.some((registro) => canonicalizarNumeroBr(registro.numero) === alvo);
}

function buildDestinationCandidates(rawValue: string | null | undefined) {
  const base = normalizePhone(rawValue);
  if (!base) return [];

  const candidates: string[] = [];

  // Heuristica BR: alguns contatos chegam sem o 9o digito do celular
  // Exemplo: 55 + DDD(2) + numero(8) => insere "9" antes do numero local.
  if (base.startsWith('55') && base.length === 12) {
    const dd = base.slice(2, 4);
    const local = base.slice(4);
    candidates.push(`55${dd}9${local}`);
  }

  candidates.push(base);
  return Array.from(new Set(candidates));
}

function resolveWebhookUrlByTipo(tipo?: string | null) {
  const normalized = String(tipo || '').trim().toUpperCase();
  if (normalized === 'ATENDIMENTO') {
    return `${config.publicBaseUrl}/api/webhook/whatsapp/atendimento`;
  }
  if (normalized === 'GESTAO') {
    return `${config.publicBaseUrl}/api/webhook/whatsapp/gestao`;
  }
  return `${config.publicBaseUrl}/api/webhook/whatsapp`;
}

function resolveWebhookRegisterMethods() {
  const primary = normalizeHttpMethod(config.uzapiWebhookMethod, 'POST');
  return [...new Set([primary, 'POST', 'PUT', 'PATCH'])];
}

function resolveWebhookRegisterPaths() {
  const configured = normalizePath(config.uzapiWebhookPath) || '/webhook';
  return [...new Set([configured, '/webhook', '/webhook/edit', '/instance/webhook'])];
}

function resolveSendMessagePaths() {
  const configured = normalizePath(config.uzapiSendMessagePath) || '/send/text';
  return [...new Set([configured, '/send/text'])];
}

function resolveSendImagePaths() {
  return ['/send/media'];
}

function calcularDelayMensagemMs(text: string) {
  const conteudo = String(text || '').trim();
  const chars = conteudo.length;
  const words = conteudo ? conteudo.split(/\s+/).length : 0;
  const pauses = (conteudo.match(/[.,!?;:]/g) || []).length;

  const base = 900;
  const porChar = chars * 18;
  const porWord = words * 55;
  const porPause = pauses * 120;
  const jitter = Math.floor(Math.random() * 450);

  const total = base + porChar + porWord + porPause + jitter;
  return Math.max(1200, Math.min(total, 9000));
}

function buildSendMessagePayloadVariants(destination: string, text: string, delayMs = 0) {
  const officialPayload = {
    number: destination,
    text,
    delay: delayMs,
  };

  return [
    { variant: 'official', payload: officialPayload },
  ];
}

function buildSendImagePayloadVariants(destination: string, imageUrl: string, caption?: string, delayMs = 0) {
  const officialPayload: Record<string, any> = {
    number: destination,
    type: 'image',
    file: imageUrl,
    delay: delayMs,
  };
  if (caption) {
    officialPayload.caption = caption;
    officialPayload.text = caption;
  }

  return [
    { variant: 'official', payload: officialPayload },
  ];
}

function buildSendAudioPayloadVariants(destination: string, audioUrl: string, delayMs = 0) {
  const officialPayload: Record<string, any> = {
    number: destination,
    type: 'audio',
    file: audioUrl,
    delay: delayMs,
  };

  return [
    { variant: 'official', payload: officialPayload },
  ];
}

function buildWebhookPayloadVariants(webhookUrl: string) {
  const officialPayload = {
    enabled: true,
    url: webhookUrl,
    events: ['messages', 'status'],
    excludeMessages: ['wasSentByApi'],
  };

  const legacyPayload = {
    webhookUrl,
    url: webhookUrl,
    eventTypes: ['messages', 'status'],
    events: ['messages', 'status'],
    modules: ['messages', 'status'],
    enabled: true,
    status: true,
    qrcode: true,
    messages: true,
    excludeMessages: ['wasSentByApi'],
  };

  return [
    { variant: 'official', payload: officialPayload },
    { variant: 'legacy', payload: legacyPayload },
  ];
}

async function registerWebhookOnUzapi(instancia: {
  uzapiUrl: string;
  uzapiToken: string;
  webhookUrl: string;
}) {
  const methods = resolveWebhookRegisterMethods();
  const paths = resolveWebhookRegisterPaths();
  const payloadVariants = buildWebhookPayloadVariants(instancia.webhookUrl);
  const attempts: Array<{ path: string; method: string; variant: string; status: number; message: string | null }> = [];

  for (const path of paths) {
    for (const method of methods) {
      for (const payloadEntry of payloadVariants) {
        const endpoint = `${instancia.uzapiUrl}${path}`;
        const response = await fetch(endpoint, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'token': instancia.uzapiToken,
          },
          body: JSON.stringify(payloadEntry.payload),
        });

        const parsed: any = await parseJsonSafe(response);
        attempts.push({
          path,
          method,
          variant: payloadEntry.variant,
          status: response.status,
          message: parsed?.error || parsed?.message || null,
        });

        if (response.ok) {
          console.log('[uzapi] Webhook registrado com sucesso:', { path, method, variant: payloadEntry.variant });
          return parsed;
        }

        if (response.status === 404 || response.status === 405) {
          continue;
        }

        throw new Error(
          parsed?.error ||
            parsed?.message ||
            `Falha ao configurar webhook na UZAPI (status ${response.status}).`
        );
      }
    }
  }

  throw new Error(
    `Falha ao configurar webhook na UZAPI. Tentativas: ${JSON.stringify(attempts).slice(0, 1200)}`
  );
}

async function rollbackUzapiInstance(uzapiUrl: string, adminToken: string, instanceToken: string, instanceId: string, instanceName: string) {
  try {
    await fetch(`${uzapiUrl}/instance/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'admintoken': adminToken,
      },
      body: JSON.stringify({ name: instanceId || instanceName }),
    });
    return;
  } catch {
    // tenta fallback
  }

  try {
    await fetch(`${uzapiUrl}/instance`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'token': instanceToken,
      },
    });
  } catch {
    // melhor esforÃ§o
  }
}

// ===== UZAPI - CRIAÃ‡ÃƒO AUTOMÃTICA =====

async function criarInstanciaUzapi(nome: string, tipo: string) {
  const cfg = await getConfigIA();
  const uzapiUrl = (cfg.uzapiUrl || config.uzapiBaseUrl || '').replace(/\/$/, '');
  const adminToken = cfg.uzapiAdminToken || config.uzapiAdminToken || '';

  if (!uzapiUrl || !adminToken) {
    throw new Error('Servidor UZapi nÃ£o configurado. VÃ¡ em ConfiguraÃ§Ãµes > Chave OpenAI e configure a URL e Token Admin da UZapi.');
  }

  console.log('[uzapi] Criando instÃ¢ncia...', { nome, tipo, uzapiUrl });

  // 1. Criar instÃ¢ncia na UZapi via admin token
  const instanceName = `barracao_${tipo.toLowerCase()}_${Date.now()}`;
  const initUrl = `${uzapiUrl}/instance/init`;
  console.log('[uzapi] POST', initUrl, { name: instanceName });

  const initRes = await fetch(initUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'admintoken': adminToken,
    },
    body: JSON.stringify({ name: instanceName, systemName: 'barracaogourmet' }),
  });

  const initData: any = await initRes.json().catch(() => ({}));
  console.log('[uzapi] Resposta init:', JSON.stringify(initData).slice(0, 500));

  if (!initRes.ok && !initData.token && !initData.instance) {
    throw new Error(`Erro ao criar instÃ¢ncia na UZapi: ${initData.message || initData.error || initRes.statusText || 'Erro desconhecido'}`);
  }

  // O token da instÃ¢ncia pode vir em diferentes campos
  const instanceToken = initData.token || initData.instance?.token || initData.apikey || initData.instance?.apikey || '';
  const instanceId = initData.instance?.id || initData.id || instanceName;

  console.log('[uzapi] Token obtido:', instanceToken ? `${instanceToken.slice(0, 8)}...` : 'VAZIO');

  if (!instanceToken) {
    throw new Error('UZapi nÃ£o retornou o token da instÃ¢ncia. Verifique a versÃ£o do servidor.');
  }

  // 2. Registrar webhook na instÃ¢ncia (usando token da instÃ¢ncia)
  const webhookUrl = resolveWebhookUrlByTipo(tipo);
  console.log('[uzapi] Registrando webhook:', webhookUrl);
  try {
    await registerWebhookOnUzapi({
      uzapiUrl,
      uzapiToken: instanceToken,
      webhookUrl,
    });
  } catch (err) {
    console.error('[uzapi] Erro ao registrar webhook:', err);
    await rollbackUzapiInstance(uzapiUrl, adminToken, instanceToken, instanceId, instanceName);
    throw new Error('Falha ao configurar webhook na UZAPI para a nova instÃ¢ncia.');
  }

  // 3. Salvar no banco
  const qrInicial = extractQrCode(initData);
  const statusInicial = resolveStatusFromUzapi(initData, qrInicial);
  const instancia = await prisma.instanciaWhatsApp.create({
    data: {
      nome,
      tipo,
      provedor: 'UZAPI',
      uzapiUrl,
      uzapiToken: instanceToken,
      uzapiInstanceId: instanceId,
      status: statusInicial,
      qrCode: qrInicial,
      telefone: extractPhone(initData),
      webhookUrl,
    },
  });

  console.log('[uzapi] InstÃ¢ncia salva no banco:', instancia.id);

  // 4. Conectar automaticamente (gerar QR Code)
  const connectResult = await conectarInstanciaUzapi(instancia.id);

  return { ...instancia, ...connectResult };
}

async function conectarInstanciaUzapi(instanciaId: string) {
  const instancia = await prisma.instanciaWhatsApp.findUnique({ where: { id: instanciaId } });
  if (!instancia || instancia.provedor !== 'UZAPI') throw new Error('InstÃ¢ncia nÃ£o encontrada');

  const url = `${instancia.uzapiUrl}/instance/connect`;
  console.log('[uzapi] Conectando instÃ¢ncia:', url);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'token': instancia.uzapiToken!,
    },
    body: JSON.stringify({ phone: '' }),
  });

  const data: any = await res.json().catch(() => ({}));
  console.log('[uzapi] Resposta connect:', JSON.stringify(data).slice(0, 500));

  const qrCode = extractQrCode(data);
  const status = resolveStatusFromUzapi(data, qrCode);
  const telefone = extractPhone(data) || instancia.telefone;

  await prisma.instanciaWhatsApp.update({
    where: { id: instanciaId },
    data: {
      status,
      telefone,
      ...(status === 'CONECTADO'
        ? { qrCode: null }
        : status === 'QR_CODE' && qrCode
          ? { qrCode }
          : {}),
    },
  });

  return {
    status,
    telefone,
    ...(status === 'QR_CODE' && qrCode ? { qrCode } : {}),
    data,
  };
}

function extractPhone(data: any): string | null {
  return (
    data?.phone ||
    data?.phoneNumber ||
    data?.me?.user ||
    data?.instance?.owner ||
    data?.instance?.phone ||
    data?.instance?.phoneNumber ||
    null
  );
}

function resolveStatusFromUzapi(data: any, qrCode: string | null) {
  const rawStatus = String(
    data?.instance?.status ||
      data?.status ||
      data?.state ||
      ''
  )
    .trim()
    .toLowerCase();

  const isConnected =
    Boolean(data?.connected) ||
    Boolean(data?.instance?.connected) ||
    Boolean(data?.status?.connected) ||
    Boolean(data?.loggedIn) ||
    Boolean(data?.instance?.loggedIn) ||
    Boolean(data?.status?.loggedIn) ||
    ['connected', 'open', 'online'].includes(rawStatus);

  const isConnecting = ['connecting', 'pairing', 'initializing'].includes(rawStatus);
  const isQrState = ['qr', 'qrcode', 'qr_required'].includes(rawStatus);

  if (isConnected) return 'CONECTADO';
  if (qrCode || isQrState) return 'QR_CODE';
  if (isConnecting) return 'CONECTANDO';
  return 'DESCONECTADO';
}

function extractQrCode(data: any): string | null {
  const possible =
    data?.qrcode ||
    data?.qr ||
    data?.qrCode ||
    data?.base64 ||
    data?.value ||
    data?.instance?.qrcode ||
    data?.instance?.qr ||
    data?.instance?.qrCode ||
    data?.instance?.base64 ||
    data?.instance?.value ||
    data?.data?.qrcode ||
    data?.data?.qr ||
    data?.data?.qrCode ||
    data?.data?.base64 ||
    data?.data?.value;

  if (typeof possible !== 'string') return null;
  const normalized = possible.trim();
  return normalized ? normalized : null;
}

async function obterQrCodeUzapi(instancia: any): Promise<string | null> {
  const paths = ['/instance/qrcode', '/instance/qr-code', '/instance/qrCode'];

  for (const path of paths) {
    try {
      const res = await fetch(`${instancia.uzapiUrl}${path}`, {
        method: 'GET',
        headers: { 'token': instancia.uzapiToken! },
      });
      if (!res.ok) continue;

      const data: any = await res.json().catch(() => ({}));
      const qrCode = extractQrCode(data);
      if (qrCode) {
        console.log('[uzapi] QR obtido por endpoint dedicado:', path);
        return qrCode;
      }
    } catch (err) {
      console.error('[uzapi] Erro ao buscar QR em', path, err);
    }
  }

  return null;
}

async function verificarStatusUzapi(instanciaId: string) {
  const instancia = await prisma.instanciaWhatsApp.findUnique({ where: { id: instanciaId } });
  if (!instancia || instancia.provedor !== 'UZAPI') throw new Error('InstÃ¢ncia nÃ£o encontrada');

  try {
    const res = await fetch(`${instancia.uzapiUrl}/instance/status`, {
      headers: { 'token': instancia.uzapiToken! },
    });
    const data: any = await res.json().catch(() => ({}));
    console.log('[uzapi] Status:', JSON.stringify(data).slice(0, 300));

    let qrCode = extractQrCode(data);
    let status = resolveStatusFromUzapi(data, qrCode);
    if (!qrCode && status !== 'CONECTADO') {
      qrCode = await obterQrCodeUzapi(instancia);
      status = resolveStatusFromUzapi(data, qrCode);
    }

    const telefone = extractPhone(data) || instancia.telefone;

    await prisma.instanciaWhatsApp.update({
      where: { id: instanciaId },
      data: {
        status,
        telefone,
        ...(status === 'CONECTADO'
          ? { qrCode: null }
          : status === 'QR_CODE' && qrCode
            ? { qrCode }
            : {}),
      },
    });

    return { status, telefone, ...(status === 'QR_CODE' && qrCode ? { qrCode } : {}) };
  } catch (err) {
    console.error('[uzapi] Erro ao verificar status:', err);
    return { status: instancia.status, telefone: instancia.telefone };
  }
}

async function enviarMensagemUzapi(instancia: any, numero: string, texto: string) {
  if (instancia.status !== 'CONECTADO') {
    const statusAtualizado = await verificarStatusUzapi(instancia.id).catch(() => ({ status: instancia.status }));
    if (statusAtualizado.status !== 'CONECTADO') {
      console.error('[uzapi] Instancia nao conectada para envio de mensagem.', {
        instanciaId: instancia.id,
        status: statusAtualizado.status,
      });
      return false;
    }
  }
  const destinations = buildDestinationCandidates(numero);
  if (destinations.length === 0) {
    console.error('[uzapi] Destino invÃƒÂ¡lido para envio:', numero);
    return false;
  }

  const paths = resolveSendMessagePaths();
  for (const destination of destinations) {
    const delayMs = calcularDelayMensagemMs(texto);
    const payloadVariants = buildSendMessagePayloadVariants(destination, texto, delayMs);
    for (const path of paths) {
      for (const payloadEntry of payloadVariants) {
        try {
          console.log('[uzapi] Enviando mensagem:', `${instancia.uzapiUrl}${path}`, {
            destination,
            variant: payloadEntry.variant,
          });

          const res = await fetch(`${instancia.uzapiUrl}${path}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'token': instancia.uzapiToken,
            },
            body: JSON.stringify(payloadEntry.payload),
          });

          if (res.ok) {
            console.log('[uzapi] Mensagem enviada com sucesso');
            return true;
          }

          const errData: any = await res.json().catch(() => ({}));
          console.log('[uzapi] Falha ao enviar:', {
            status: res.status,
            path,
            destination,
            variant: payloadEntry.variant,
            errData,
          });
        } catch (err) {
          console.error('[uzapi] Erro ao enviar mensagem:', { path, destination, variant: payloadEntry.variant, err });
        }
      }
    }
  }

  return false;
}

async function enviarImagemUzapi(instancia: any, numero: string, imageUrl: string, caption?: string) {
  if (instancia.status !== 'CONECTADO') {
    const statusAtualizado = await verificarStatusUzapi(instancia.id).catch(() => ({ status: instancia.status }));
    if (statusAtualizado.status !== 'CONECTADO') {
      console.error('[uzapi] Instancia nao conectada para envio de imagem.', {
        instanciaId: instancia.id,
        status: statusAtualizado.status,
      });
      return false;
    }
  }
  const destinations = buildDestinationCandidates(numero);
  if (destinations.length === 0) {
    console.error('[uzapi] Destino invÃƒÆ’Ã‚Â¡lido para envio de imagem:', numero);
    return false;
  }

  const paths = resolveSendImagePaths();
  for (const destination of destinations) {
    const payloadVariants = buildSendImagePayloadVariants(destination, imageUrl, caption, 0);
    for (const path of paths) {
      for (const payloadEntry of payloadVariants) {
        try {
          const res = await fetch(`${instancia.uzapiUrl}${path}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'token': instancia.uzapiToken,
            },
            body: JSON.stringify(payloadEntry.payload),
          });

          if (res.ok) {
            console.log('[uzapi] Imagem enviada com sucesso');
            return true;
          }

          const errData: any = await res.json().catch(() => ({}));
          console.log('[uzapi] Falha ao enviar imagem:', {
            status: res.status,
            path,
            destination,
            variant: payloadEntry.variant,
            errData,
          });
        } catch (err) {
          console.error('[uzapi] Erro ao enviar imagem:', { path, destination, variant: payloadEntry.variant, err });
        }
      }
    }
  }

  return false;
}

async function enviarAudioUzapi(instancia: any, numero: string, audioUrl: string) {
  if (instancia.status !== 'CONECTADO') {
    const statusAtualizado = await verificarStatusUzapi(instancia.id).catch(() => ({ status: instancia.status }));
    if (statusAtualizado.status !== 'CONECTADO') {
      console.error('[uzapi] Instancia nao conectada para envio de audio.', {
        instanciaId: instancia.id,
        status: statusAtualizado.status,
      });
      return false;
    }
  }
  const destinations = buildDestinationCandidates(numero);
  if (destinations.length === 0) {
    console.error('[uzapi] Destino invalido para envio de audio:', numero);
    return false;
  }

  const paths = resolveSendImagePaths();
  for (const destination of destinations) {
    const payloadVariants = buildSendAudioPayloadVariants(destination, audioUrl, 0);
    for (const path of paths) {
      for (const payloadEntry of payloadVariants) {
        try {
          const res = await fetch(`${instancia.uzapiUrl}${path}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'token': instancia.uzapiToken,
            },
            body: JSON.stringify(payloadEntry.payload),
          });

          if (res.ok) {
            console.log('[uzapi] Audio enviado com sucesso');
            return true;
          }

          const errData: any = await res.json().catch(() => ({}));
          console.log('[uzapi] Falha ao enviar audio:', {
            status: res.status,
            path,
            destination,
            variant: payloadEntry.variant,
            errData,
          });
        } catch (err) {
          console.error('[uzapi] Erro ao enviar audio:', { path, destination, variant: payloadEntry.variant, err });
        }
      }
    }
  }

  return false;
}

// ===== META OFICIAL =====

// Bate as credenciais na Graph API e devolve o telefone publicado. Serve para
// criar a instancia e para trocar as credenciais depois: nos dois casos gravar
// sem validar deixaria a instancia muda, sem erro visivel na tela.
async function validarCredenciaisMeta(accessToken: string, phoneNumberId: string) {
  console.log('[meta] Validando credenciais...', { phoneNumberId });
  try {
    const res = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const errData: any = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || 'Credenciais inválidas');
    }
    const data: any = await res.json().catch(() => ({}));
    return String(data?.display_phone_number || '').replace(/\D/g, '');
  } catch (err: any) {
    throw new Error(`Erro ao validar credenciais Meta: ${err.message}`);
  }
}

async function criarInstanciaMeta(nome: string, tipo: string, accessToken: string, phoneNumberId: string, wabaId: string) {
  const telefonePublico = await validarCredenciaisMeta(accessToken, phoneNumberId);

  const instancia = await prisma.instanciaWhatsApp.create({
    data: {
      nome,
      tipo,
      provedor: 'META_OFICIAL',
      metaAccessToken: accessToken,
      metaPhoneNumberId: phoneNumberId,
      metaWabaId: wabaId,
      telefone: telefonePublico || undefined,
      status: 'CONECTADO',
      webhookUrl: resolveWebhookUrlByTipo(tipo),
    },
  });
  console.log('[meta] InstÃ¢ncia criada:', instancia.id);
  return instancia;
}

async function enviarMensagemMeta(instancia: any, numero: string, texto: string) {
  const url = `https://graph.facebook.com/v22.0/${instancia.metaPhoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${instancia.metaAccessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: numero,
        type: 'text',
        text: { body: texto },
      }),
    });
    console.log('[meta] Envio mensagem:', res.status);
    return res.ok;
  } catch (err) {
    console.error('[meta] Erro ao enviar:', err);
    return false;
  }
}

async function enviarImagemLinkMeta(instancia: any, numero: string, imageUrl: string, caption?: string) {
  const url = `https://graph.facebook.com/v22.0/${instancia.metaPhoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${instancia.metaAccessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numero,
      type: 'image',
      image: { link: imageUrl, ...(caption ? { caption } : {}) },
    }),
  });
  console.log('[meta] Envio imagem (link):', res.status);
  return res.ok;
}

async function enviarImagemMeta(instancia: any, numero: string, imageUrl: string, caption?: string) {
  try {
    // Preferimos upload por media_id (mais confiavel que depender da Meta baixar o link).
    const bytes = await lerBytesMidia(imageUrl);
    if (bytes) {
      const mediaId = await uploadMediaMeta(instancia, bytes.buffer, bytes.mimeType, `imagem${bytes.ext || '.jpg'}`);
      if (mediaId) {
        const ok = await enviarMidiaPorIdMeta(instancia, numero, 'image', mediaId, caption);
        if (ok) return true;
      }
    }
    // Fallback: envio por link.
    return await enviarImagemLinkMeta(instancia, numero, imageUrl, caption);
  } catch (err) {
    console.error('[meta] Erro ao enviar imagem:', err);
    return false;
  }
}

async function enviarAudioMeta(instancia: any, numero: string, audioUrl: string) {
  try {
    const bytes = await lerBytesMidia(audioUrl);
    if (!bytes) {
      console.error('[meta] nao foi possivel ler bytes do audio', { audioUrl: audioUrl.slice(0, 80) });
      return false;
    }

    // A Meta so aceita audio OGG/OPUS (entre outros), mas o navegador costuma gravar em webm.
    let buffer = bytes.buffer;
    const jaOgg = bytes.ext === '.ogg' || bytes.ext === '.opus' || bytes.mimeType.includes('ogg');
    if (!jaOgg) {
      const convertido = await transcodeParaOggOpus(bytes.buffer, (bytes.ext || '.webm').replace('.', '') || 'webm');
      if (convertido) {
        buffer = convertido;
        console.log('[meta] audio transcodado para ogg/opus', { tamanho: buffer.length });
      } else {
        console.warn('[meta] transcodificacao indisponivel; tentando enviar audio original (a Meta pode recusar).');
      }
    }

    const mediaId = await uploadMediaMeta(instancia, buffer, 'audio/ogg', 'audio.ogg');
    if (!mediaId) {
      console.error('[meta] upload de audio falhou; abortando envio.');
      return false;
    }
    return await enviarMidiaPorIdMeta(instancia, numero, 'audio', mediaId);
  } catch (err) {
    console.error('[meta] Erro ao enviar audio:', err);
    return false;
  }
}

/**
 * Baixa uma midia recebida via Meta Cloud API a partir do mediaId.
 * 1) GET /{mediaId} -> retorna a URL temporaria e o mime_type.
 * 2) GET na URL (com Bearer) -> bytes binarios.
 */
async function baixarMidiaMeta(instancia: any, mediaId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${instancia.metaAccessToken}` },
    });
    if (!metaRes.ok) {
      console.error('[meta] erro ao obter metadados da midia', { status: metaRes.status, mediaId });
      return null;
    }
    const meta: any = await metaRes.json().catch(() => null);
    const mediaUrl = meta?.url;
    const mimeType = String(meta?.mime_type || 'application/octet-stream');
    if (!mediaUrl) {
      console.error('[meta] metadados da midia sem url', { mediaId });
      return null;
    }

    const binRes = await fetch(mediaUrl, {
      headers: { 'Authorization': `Bearer ${instancia.metaAccessToken}` },
    });
    if (!binRes.ok) {
      console.error('[meta] erro ao baixar binario da midia', { status: binRes.status, mediaId });
      return null;
    }
    const arrayBuffer = await binRes.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), mimeType };
  } catch (err) {
    console.error('[meta] falha ao baixar midia', { mediaId, err });
    return null;
  }
}

// ===== FUNÃ‡Ã•ES PÃšBLICAS =====

export async function criarInstancia(params: {
  nome: string;
  tipo: 'GESTAO' | 'ATENDIMENTO';
  provedor: 'UZAPI' | 'META_OFICIAL';
  metaAccessToken?: string;
  metaPhoneNumberId?: string;
  metaWabaId?: string;
}) {
  const { nome, tipo, provedor } = params;
  console.log('[whatsapp] Criando instÃ¢ncia:', { nome, tipo, provedor });

  if (provedor === 'UZAPI') {
    return criarInstanciaUzapi(nome, tipo);
  }

  if (provedor === 'META_OFICIAL') {
    if (!params.metaAccessToken || !params.metaPhoneNumberId || !params.metaWabaId) {
      throw new Error('Access Token, Phone Number ID e WABA ID sÃ£o obrigatÃ³rios');
    }
    return criarInstanciaMeta(nome, tipo, params.metaAccessToken, params.metaPhoneNumberId, params.metaWabaId);
  }

  throw new Error('Provedor invÃ¡lido');
}

export async function conectarInstancia(instanciaId: string) {
  const instancia = await prisma.instanciaWhatsApp.findUnique({ where: { id: instanciaId } });
  if (!instancia) throw new Error('InstÃ¢ncia nÃ£o encontrada');

  if (instancia.provedor === 'UZAPI') {
    return conectarInstanciaUzapi(instanciaId);
  }

  return { status: 'CONECTADO' };
}

export async function verificarStatus(instanciaId: string) {
  const instancia = await prisma.instanciaWhatsApp.findUnique({ where: { id: instanciaId } });
  if (!instancia) throw new Error('InstÃ¢ncia nÃ£o encontrada');

  if (instancia.provedor === 'UZAPI') {
    return verificarStatusUzapi(instanciaId);
  }

  return { status: instancia.status };
}

export async function desconectarInstancia(instanciaId: string) {
  const instancia = await prisma.instanciaWhatsApp.findUnique({ where: { id: instanciaId } });
  if (!instancia) throw new Error('InstÃ¢ncia nÃ£o encontrada');

  if (instancia.provedor === 'UZAPI') {
    try {
      await fetch(`${instancia.uzapiUrl}/instance/disconnect`, {
        method: 'POST',
        headers: { 'token': instancia.uzapiToken! },
      });
    } catch {}
  }

  await prisma.instanciaWhatsApp.update({
    where: { id: instanciaId },
    data: { status: 'DESCONECTADO', qrCode: null },
  });

  return { status: 'DESCONECTADO' };
}

export async function atualizarCredenciais(
  instanciaId: string,
  params: {
    metaAccessToken?: string;
    metaPhoneNumberId?: string;
    metaWabaId?: string;
    uzapiUrl?: string;
    uzapiToken?: string;
  }
) {
  const instancia = await prisma.instanciaWhatsApp.findUnique({ where: { id: instanciaId } });
  if (!instancia) throw new Error('Instância não encontrada');

  // A listagem devolve os tokens mascarados, entao a tela nunca tem o valor real
  // para reenviar. Campo vazio (ou o proprio '***') mantem o que ja esta gravado:
  // so troca o que for de fato digitado.
  const informado = (valor?: string) => {
    const limpo = (valor || '').trim();
    return limpo && limpo !== '***' ? limpo : undefined;
  };

  if (instancia.provedor === 'META_OFICIAL') {
    const accessToken = informado(params.metaAccessToken) || instancia.metaAccessToken || '';
    const phoneNumberId = informado(params.metaPhoneNumberId) || instancia.metaPhoneNumberId || '';
    const wabaId = informado(params.metaWabaId) || instancia.metaWabaId || '';

    if (!accessToken || !phoneNumberId || !wabaId) {
      throw new Error('Access Token, Phone Number ID e WABA ID são obrigatórios');
    }

    const telefonePublico = await validarCredenciaisMeta(accessToken, phoneNumberId);

    return prisma.instanciaWhatsApp.update({
      where: { id: instanciaId },
      data: {
        metaAccessToken: accessToken,
        metaPhoneNumberId: phoneNumberId,
        metaWabaId: wabaId,
        telefone: telefonePublico || instancia.telefone,
        status: 'CONECTADO',
      },
    });
  }

  const uzapiUrl = informado(params.uzapiUrl) || instancia.uzapiUrl || '';
  const uzapiToken = informado(params.uzapiToken) || instancia.uzapiToken || '';
  if (!uzapiUrl || !uzapiToken) throw new Error('URL e token do UZapi são obrigatórios');

  return prisma.instanciaWhatsApp.update({
    where: { id: instanciaId },
    data: { uzapiUrl, uzapiToken },
  });
}

export async function excluirInstancia(instanciaId: string) {
  const instancia = await prisma.instanciaWhatsApp.findUnique({ where: { id: instanciaId } });
  if (!instancia) throw new Error('InstÃ¢ncia nÃ£o encontrada');

  if (instancia.provedor === 'UZAPI') {
    try {
      const cfg = await getConfigIA();
      const adminToken = cfg.uzapiAdminToken || config.uzapiAdminToken || '';
      if (adminToken) {
        await fetch(`${instancia.uzapiUrl}/instance/delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'admintoken': adminToken,
          },
          body: JSON.stringify({ name: instancia.uzapiInstanceId }),
        });
      }
    } catch {}
  }

  await prisma.instanciaWhatsApp.delete({ where: { id: instanciaId } });
  return { sucesso: true };
}

export async function listarInstancias(tipo?: string) {
  const where: any = {};
  if (tipo) where.tipo = tipo;
  const instancias = await prisma.instanciaWhatsApp.findMany({
    where,
    orderBy: { criadoEm: 'desc' },
  });

  const uzapiPendentes = instancias.filter(
    (instancia) =>
      instancia.provedor === 'UZAPI' &&
      instancia.status !== 'CONECTADO' &&
      !!instancia.uzapiUrl &&
      !!instancia.uzapiToken
  );

  if (uzapiPendentes.length === 0) {
    return instancias;
  }

  await Promise.all(
    uzapiPendentes.map(async (instancia) => {
      try {
        await verificarStatusUzapi(instancia.id);
      } catch (err) {
        console.error('[uzapi] Falha ao atualizar status na listagem:', instancia.id, err);
      }
    })
  );

  return prisma.instanciaWhatsApp.findMany({ where, orderBy: { criadoEm: 'desc' } });
}

export async function enviarMensagem(instanciaId: string, numero: string, texto: string) {
  console.log('[whatsapp] enviarMensagem', { instanciaId, numero, textoPreview: texto.slice(0, 80) });
  const instancia = await prisma.instanciaWhatsApp.findUnique({ where: { id: instanciaId } });
  if (!instancia) {
    console.error('[whatsapp] instancia nao encontrada para envio:', instanciaId);
    throw new Error('Instância não encontrada');
  }

  console.log('[whatsapp] provedor:', instancia.provedor);
  if (instancia.provedor === 'UZAPI') {
    const result = await enviarMensagemUzapi(instancia, numero, texto);
    console.log('[whatsapp] resultado envio UZAPI:', result);
    return result;
  }
  const result = await enviarMensagemMeta(instancia, numero, texto);
  console.log('[whatsapp] resultado envio Meta:', result);
  return result;
}

export async function enviarImagem(instanciaId: string, numero: string, imageUrl: string, caption?: string) {
  console.log('[whatsapp] enviarImagem', { instanciaId, numero, imageUrl: imageUrl.slice(0, 80) });
  const instancia = await prisma.instanciaWhatsApp.findUnique({ where: { id: instanciaId } });
  if (!instancia) {
    console.error('[whatsapp] instancia nao encontrada para envio imagem:', instanciaId);
    throw new Error('Instância não encontrada');
  }

  if (instancia.provedor === 'UZAPI') {
    const result = await enviarImagemUzapi(instancia, numero, imageUrl, caption);
    console.log('[whatsapp] resultado envio imagem UZAPI:', result);
    return result;
  }
  const result = await enviarImagemMeta(instancia, numero, imageUrl, caption);
  console.log('[whatsapp] resultado envio imagem Meta:', result);
  return result;
}

export async function enviarAudio(instanciaId: string, numero: string, audioUrl: string) {
  console.log('[whatsapp] enviarAudio', { instanciaId, numero, audioUrl: audioUrl.slice(0, 80) });
  const instancia = await prisma.instanciaWhatsApp.findUnique({ where: { id: instanciaId } });
  if (!instancia) {
    console.error('[whatsapp] instancia nao encontrada para envio audio:', instanciaId);
    throw new Error('Instância não encontrada');
  }

  if (instancia.provedor === 'UZAPI') {
    const result = await enviarAudioUzapi(instancia, numero, audioUrl);
    console.log('[whatsapp] resultado envio audio UZAPI:', result);
    return result;
  }
  const result = await enviarAudioMeta(instancia, numero, audioUrl);
  console.log('[whatsapp] resultado envio audio Meta:', result);
  return result;
}

/**
 * Baixa uma midia recebida (atualmente suporta Meta via mediaId).
 * Retorna o buffer e o mime type, ou null se nao for possivel.
 */
export async function baixarMidiaWhatsapp(instanciaId: string, mediaId: string) {
  const instancia = await prisma.instanciaWhatsApp.findUnique({ where: { id: instanciaId } });
  if (!instancia) {
    console.error('[whatsapp] instancia nao encontrada para baixar midia:', instanciaId);
    return null;
  }
  if (instancia.provedor !== 'META_OFICIAL') {
    console.warn('[whatsapp] download de midia suportado apenas para Meta no momento.', { provedor: instancia.provedor });
    return null;
  }
  return baixarMidiaMeta(instancia, mediaId);
}

export async function enviarTypingIndicator(instanciaId: string, messageId: string) {
  console.log('[whatsapp] enviarTypingIndicator', { instanciaId, messageId });
  const instancia = await prisma.instanciaWhatsApp.findUnique({ where: { id: instanciaId } });
  if (!instancia || instancia.provedor !== 'META_OFICIAL') {
    console.log('[whatsapp] typing ignorado (nao e Meta ou instancia nao encontrada)');
    return;
  }

  const url = `https://graph.facebook.com/v22.0/${instancia.metaPhoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${instancia.metaAccessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: { type: 'text' },
      }),
    });
    console.log('[whatsapp] typing indicator enviado', { status: res.status, ok: res.ok });
  } catch (err) {
    console.error('[whatsapp] erro ao enviar typing indicator:', err);
  }
}

