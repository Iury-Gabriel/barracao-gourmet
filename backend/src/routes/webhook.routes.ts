import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { config } from '../config/env';
import { gerarRespostaIA, liberarSaudacao } from '../services/ia.service';
import * as whatsappService from '../services/whatsapp.service';
import { enqueueWebhookMessage, startWebhookDebounceWorker, DebouncedWebhookBatch } from '../services/webhook-debounce.service';
import { consultarCobrancaMercadoPago, consultarPagamentoMercadoPago, getMercadoPagoWebhookUrl } from '../services/mercado-pago.service';
import { marcarPedidoComoPago } from '../services/pedidos.service';
import { isIaPausada } from '../services/atendimentos.service';
import { transcreverAudioBuffer } from '../services/transcricao.service';
import { uploadsDir } from '../lib/uploads';
import { buildPublicUrl } from '../lib/url';
import { notificarErroCritico } from '../lib/alertas';

// Extensoes por mime type para midias recebidas do WhatsApp.
const EXT_POR_MIME: Record<string, string> = {
  'audio/ogg': '.ogg',
  'audio/opus': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/amr': '.amr',
  'audio/wav': '.wav',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function extensaoPorMime(mimeType: string, fallback: string) {
  const base = String(mimeType || '').split(';')[0].trim().toLowerCase();
  return EXT_POR_MIME[base] || fallback;
}

function salvarMidiaLocal(buffer: Buffer, mimeType: string, fallbackExt: string) {
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const ext = extensaoPorMime(mimeType, fallbackExt);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), buffer);
  return buildPublicUrl(`/uploads/${filename}`);
}

// Processa midia recebida (Meta): transcreve audio e salva imagem, retornando o texto/url final.
async function processarMidiaRecebida(
  instanciaId: string,
  mediaTipo: 'AUDIO' | 'IMAGEM',
  mediaId: string,
  caption?: string,
): Promise<string> {
  const midia = await whatsappService.baixarMidiaWhatsapp(instanciaId, mediaId);

  if (mediaTipo === 'AUDIO') {
    if (!midia) return '(audio recebido, nao foi possivel baixar)';
    const transcricao = await transcreverAudioBuffer({
      audioBuffer: midia.buffer,
      mimeType: midia.mimeType,
      filename: `audio-${mediaId}${extensaoPorMime(midia.mimeType, '.ogg')}`,
    });
    return transcricao
      ? `[audio] ${transcricao}`
      : '(audio recebido, nao foi possivel transcrever)';
  }

  // IMAGEM
  if (!midia) return [caption, '(imagem recebida)'].filter(Boolean).join(' ');
  const url = salvarMidiaLocal(midia.buffer, midia.mimeType, '.jpg');
  return [caption, url].filter(Boolean).join('\n');
}

const router = Router();

startWebhookDebounceWorker(processarLoteDebounce).catch((error) => {
  console.error('[webhook] falha ao iniciar worker de debounce:', error);
  notificarErroCritico('sistema', 'Falha ao iniciar o worker de debounce do webhook (fila de mensagens da IA parada).', {
    detalhes: error,
  });
});

router.post('/whatsapp/:tipo?', async (req: Request, res: Response) => {
  try {
    // Sempre responder rapido para evitar timeout no provedor.
    res.status(200).json({ received: true });

    const body = req.body;
    console.log('[webhook] POST recebido', {
      tipo: req.params?.tipo,
      headers: {
        'content-type': req.headers['content-type'],
        'x-hub-signature': req.headers['x-hub-signature-256'] || req.headers['x-hub-signature'] || null,
      },
      bodyKeys: Object.keys(body || {}),
      bodyPreview: JSON.stringify(body).slice(0, 500),
    });

    const tipoParam = String(req.params?.tipo || '').trim().toLowerCase();
    const tipoAgenteForcado =
      tipoParam === 'gestao' ? 'GESTAO' :
      tipoParam === 'atendimento' ? 'ATENDIMENTO' :
      undefined;

    const entrada = await extrairMensagemWebhook(body, req, tipoAgenteForcado);
    if (!entrada) {
      console.log('[webhook] entrada nula — ignorando (sem mensagem valida no payload)');
      return;
    }

    const { remetente, instanciaId, isFromMe, metaMessageId, mediaTipo, mediaId } = entrada;
    let { mensagem } = entrada;
    console.log('[webhook] mensagem extraida', { remetente, mensagem: mensagem.slice(0, 80), instanciaId, isFromMe, metaMessageId, mediaTipo });

    if (isFromMe || !remetente || !instanciaId) {
      console.log('[webhook] ignorando mensagem', { isFromMe, semRemetente: !remetente, semInstancia: !instanciaId });
      return;
    }

    const instancia = await prisma.instanciaWhatsApp.findUnique({ where: { id: instanciaId } });
    if (!instancia) {
      console.warn('[webhook] instancia nao encontrada no banco:', instanciaId);
      return;
    }

    // Processa midia recebida (audio -> transcricao; imagem -> salva e referencia a URL).
    if (mediaTipo && mediaId) {
      console.log('[webhook] processando midia recebida', { mediaTipo, mediaId });
      mensagem = await processarMidiaRecebida(instanciaId, mediaTipo, mediaId, mensagem);
      console.log('[webhook] midia processada', { mediaTipo, resultadoPreview: mensagem.slice(0, 80) });
    }

    if (!mensagem) {
      console.log('[webhook] ignorando mensagem sem conteudo apos processamento');
      return;
    }

    const tipoInstancia = instancia.tipo as 'GESTAO' | 'ATENDIMENTO';

    // Instancia unificada: o agente e escolhido pelo REMETENTE, nao pela instancia.
    // - Instancia dedicada de GESTAO (setup antigo) continua respondendo como gestao.
    // - Nas demais, um numero cadastrado como gestao fala com o agente de gestao;
    //   qualquer outro numero cai no atendimento.
    let tipoAgente: 'GESTAO' | 'ATENDIMENTO';
    if (tipoInstancia === 'GESTAO') {
      tipoAgente = 'GESTAO';
    } else {
      tipoAgente = (await whatsappService.isNumeroGestao(remetente)) ? 'GESTAO' : 'ATENDIMENTO';
    }

    const queued = await enqueueWebhookMessage({
      instanciaId,
      remetente,
      tipoAgente,
      mensagem,
      metaMessageId,
    });

    if (!queued) {
      console.error('[webhook] falha ao enfileirar mensagem no debounce.');
      return;
    }

    console.log('[webhook] mensagem enfileirada para debounce', {
      instanciaId,
      tipoAgente,
      remetente,
      metaMessageId,
      mensagemPreview: mensagem.slice(0, 80),
    });
  } catch (err) {
    console.error('[webhook] erro ao processar mensagem:', err);
    notificarErroCritico('webhook', 'Erro ao processar mensagem recebida do WhatsApp.', { detalhes: err });
  }
});

router.get('/whatsapp/:tipo?', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = req.query['hub.verify_token'];

  console.log('[webhook] GET recebido (verificacao Meta)', { mode, verifyToken, challenge: String(challenge).slice(0, 30) });

  if (mode === 'subscribe' && verifyToken === 'token123') {
    console.log('[webhook] verificacao Meta OK — respondendo challenge');
    res.status(200).send(challenge);
    return;
  }

  console.warn('[webhook] verificacao Meta FALHOU', { mode, verifyToken });
  res.status(403).send('Forbidden');
});

router.get('/mercado-pago', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    webhookUrl: getMercadoPagoWebhookUrl(),
  });
});

router.post('/mercado-pago', async (req: Request, res: Response) => {
  const payload = {
    body: req.body,
    queryDataId: String(req.query['data.id'] || ''),
    queryType: String(req.query.type || ''),
    xSignature: String(req.headers['x-signature'] || ''),
    xRequestId: String(req.headers['x-request-id'] || ''),
  };

  if (!validarAssinaturaMercadoPagoWebhook(payload)) {
    console.warn('[mercado-pago] assinatura invalida no webhook');
    notificarErroCritico('pagamento', 'Webhook do Mercado Pago recebido com assinatura invalida (verifique MERCADO_PAGO_WEBHOOK_SECRET ou requisicao suspeita).', {
      chave: 'pagamento:assinatura-invalida',
    });
    res.status(401).json({ error: 'Assinatura do webhook invalida.' });
    return;
  }

  res.status(200).json({ received: true });

  processarWebhookMercadoPago(payload).catch((error) => {
    console.error('[mercado-pago] falha ao processar webhook', error);
    notificarErroCritico('pagamento', 'Falha ao processar webhook do Mercado Pago (pagamento pode nao ter sido confirmado no pedido).', {
      detalhes: { paymentId: payload.queryDataId, error },
    });
  });
});

function validarAssinaturaMercadoPagoWebhook(payload: {
  body: any;
  queryDataId: string;
  xSignature: string;
  xRequestId: string;
}) {
  if (!config.mercadoPagoWebhookSecret) {
    return true;
  }

  const dataId = String(payload.queryDataId || payload.body?.data?.id || '').trim();
  const xSignature = String(payload.xSignature || '').trim();
  const xRequestId = String(payload.xRequestId || '').trim();

  if (!dataId || !xSignature || !xRequestId) {
    return false;
  }

  const parts = xSignature.split(',').map((part) => part.trim());
  const ts = parts.find((part) => part.startsWith('ts='))?.slice(3) || '';
  const v1 = parts.find((part) => part.startsWith('v1='))?.slice(3) || '';

  if (!ts || !v1) {
    return false;
  }

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const expected = crypto
    .createHmac('sha256', config.mercadoPagoWebhookSecret)
    .update(manifest)
    .digest('hex')
    .toLowerCase();

  const received = v1.toLowerCase();
  if (expected.length !== received.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

async function processarWebhookMercadoPago(payload: {
  body: any;
  queryDataId: string;
  queryType: string;
}) {
  const tipo = String(payload.body?.type || payload.queryType || '').trim().toLowerCase();
  const acao = String(payload.body?.action || '').trim().toLowerCase();
  const dataId = String(payload.body?.data?.id || payload.queryDataId || '').trim();

  console.log('[mercado-pago] webhook recebido', {
    tipo,
    acao,
    dataId,
    bodyPreview: JSON.stringify(payload.body || {}).slice(0, 400),
  });

  if (!dataId || (tipo !== 'payment' && tipo !== 'order')) {
    console.log('[mercado-pago] webhook ignorado por tipo/data ausente', { tipo, dataId });
    return;
  }

  let payment: { id: string; status: string; statusDetail: string; externalReference: string; orderId: string };

  if (tipo === 'order') {
    // Notificacoes tipo "order" (Orders API, usada no Pix do cardapio) nao tem um payment
    // "classico" associado — /v1/payments/{id} retorna 404 para o id novo. O status da
    // propria order ja indica se foi pago (processed + accredited = pago).
    const orderSnapshot = await consultarCobrancaMercadoPago(dataId);
    const orderPago = orderSnapshot.status === 'processed' && orderSnapshot.statusDetail === 'accredited';
    payment = {
      id: orderSnapshot.paymentId || orderSnapshot.orderId,
      status: orderPago ? 'approved' : orderSnapshot.status,
      statusDetail: orderSnapshot.statusDetail,
      externalReference: String((orderSnapshot.rawResponse as any)?.external_reference || ''),
      orderId: orderSnapshot.orderId,
    };
  } else {
    payment = await consultarPagamentoMercadoPago(dataId);
  }

  const pagamentoAprovado = payment.status === 'approved' && payment.statusDetail === 'accredited';

  if (!pagamentoAprovado) {
    console.log('[mercado-pago] pagamento ainda nao aprovado', {
      paymentId: payment.id,
      status: payment.status,
      statusDetail: payment.statusDetail,
    });
    return;
  }

  let pedido = await prisma.pedido.findFirst({
    where: { mercadoPagoPaymentId: payment.id },
    include: {
      itens: { include: { produto: true } },
      historico: { orderBy: { criadoEm: 'asc' } },
    },
  });

  if (!pedido && payment.externalReference) {
    const matchNumero = payment.externalReference.match(/^pedido-(\d+)$/i);
    if (matchNumero) {
      pedido = await prisma.pedido.findUnique({
        where: { numero: Number(matchNumero[1]) },
        include: {
          itens: { include: { produto: true } },
          historico: { orderBy: { criadoEm: 'asc' } },
        },
      });
    }
  }

  if (!pedido && payment.orderId) {
    pedido = await prisma.pedido.findFirst({
      where: { mercadoPagoOrderId: payment.orderId },
      include: {
        itens: { include: { produto: true } },
        historico: { orderBy: { criadoEm: 'asc' } },
      },
    });
  }

  if (!pedido) {
    console.warn('[mercado-pago] nenhum pedido local encontrado para o pagamento aprovado', {
      paymentId: payment.id,
      externalReference: payment.externalReference,
    });
    return;
  }

  let orderSnapshot: Awaited<ReturnType<typeof consultarCobrancaMercadoPago>> | null = null;
  if (pedido.mercadoPagoOrderId) {
    try {
      orderSnapshot = await consultarCobrancaMercadoPago(pedido.mercadoPagoOrderId);
    } catch (error) {
      console.error('[mercado-pago] falha ao consultar order apos webhook de pagamento', {
        pedidoId: pedido.id,
        mercadoPagoOrderId: pedido.mercadoPagoOrderId,
        error,
      });
    }
  }

  const orderConfirmada = orderSnapshot?.status === 'processed' && orderSnapshot?.statusDetail === 'accredited';
  if (!orderConfirmada && !pagamentoAprovado) {
    return;
  }

  if (pedido.statusPagamento !== 'PAGO') {
    await marcarPedidoComoPago(pedido.id, 'PIX', 'webhook do Mercado Pago');
  }

  await prisma.pedido.update({
    where: { id: pedido.id },
    data: {
      mercadoPagoPaymentId: payment.id,
      mercadoPagoStatus: orderSnapshot?.status || pedido.mercadoPagoStatus || undefined,
      mercadoPagoStatusDetail: orderSnapshot?.statusDetail || pedido.mercadoPagoStatusDetail || undefined,
      mercadoPagoQrCode: orderSnapshot?.pix?.payload || pedido.mercadoPagoQrCode || undefined,
      mercadoPagoQrCodeImageUrl: orderSnapshot?.pix?.qrCodeImageUrl || pedido.mercadoPagoQrCodeImageUrl || undefined,
      mercadoPagoTicketUrl: orderSnapshot?.pix?.ticketUrl || pedido.mercadoPagoTicketUrl || undefined,
      mercadoPagoExpirationDate: orderSnapshot?.pix?.expirationDate || pedido.mercadoPagoExpirationDate || undefined,
    },
  });

  console.log('[mercado-pago] pagamento confirmado via webhook', {
    pedidoId: pedido.id,
    numeroPedido: pedido.numero,
    paymentId: payment.id,
    mercadoPagoOrderId: pedido.mercadoPagoOrderId,
  });
}

async function processarLoteDebounce(batch: DebouncedWebhookBatch) {
  console.log('[processamento] iniciando processamento do lote', {
    instanciaId: batch.instanciaId,
    remetente: batch.remetente,
    tipoAgente: batch.tipoAgente,
    quantidadeMensagens: batch.mensagens.length,
    lastMetaMessageId: batch.lastMetaMessageId || null,
  });

  const mensagemUnificada = consolidarMensagens(batch.mensagens);
  if (!mensagemUnificada) {
    console.log('[processamento] mensagem unificada vazia, ignorando');
    return;
  }

  console.log('[processamento] mensagem unificada:', mensagemUnificada.slice(0, 200));

  // Comando /clear: apaga todo o historico desta conversa (instancia + contato).
  if (mensagemUnificada.trim().toLowerCase() === '/clear') {
    const apagadas = await prisma.mensagemIA.deleteMany({
      where: { instanciaId: batch.instanciaId, remetente: batch.remetente },
    });
    console.log('[processamento] comando /clear: historico apagado', {
      instanciaId: batch.instanciaId,
      remetente: batch.remetente,
      registrosApagados: apagadas.count,
    });
    await whatsappService.enviarMensagem(
      batch.instanciaId,
      batch.remetente,
      'Pronto! Apaguei o historico da nossa conversa. Podemos comecar do zero.',
    );
    return;
  }

  // Botao global de liga/desliga do agente. Desligado: registra a mensagem para o painel,
  // mas nao responde (vale para gestao e atendimento).
  const configIA = await prisma.configuracaoIA.findFirst();
  if (configIA && configIA.iaAtiva === false) {
    console.log('[ia] agente desativado globalmente, registrando mensagem sem responder', {
      instanciaId: batch.instanciaId,
      remetente: batch.remetente,
    });
    await prisma.mensagemIA.create({
      data: {
        instanciaId: batch.instanciaId,
        remetente: batch.remetente,
        conteudo: mensagemUnificada,
        resposta: null,
      },
    });
    return;
  }

  // Se o atendimento humano assumiu (IA pausada para este contato), nao responder automaticamente.
  // Ainda registramos a mensagem recebida para o operador visualizar no painel.
  if (await isIaPausada(batch.instanciaId, batch.remetente)) {
    console.log('[ia] IA pausada para este contato, registrando mensagem sem responder', {
      instanciaId: batch.instanciaId,
      remetente: batch.remetente,
    });
    await prisma.mensagemIA.create({
      data: {
        instanciaId: batch.instanciaId,
        remetente: batch.remetente,
        conteudo: mensagemUnificada,
        resposta: null,
      },
    });
    return;
  }

  // Enviar typing indicator antes de processar (apenas Meta)
  if (batch.lastMetaMessageId) {
    console.log('[typing] enviando typing indicator antes da IA', { instanciaId: batch.instanciaId, messageId: batch.lastMetaMessageId });
    await whatsappService.enviarTypingIndicator(batch.instanciaId, batch.lastMetaMessageId);
  }

  console.log('[ia] chamando IA para gerar resposta...', { tipoAgente: batch.tipoAgente, remetente: batch.remetente });
  const startIA = Date.now();
  const resultado = await gerarRespostaIA({
    mensagem: mensagemUnificada,
    remetente: batch.remetente,
    tipoAgente: batch.tipoAgente,
    instanciaId: batch.instanciaId,
  });
  console.log('[ia] resposta gerada', {
    tempoMs: Date.now() - startIA,
    respostaPreview: resultado.text?.slice(0, 150) || '(vazio)',
  });

  console.log('[processamento] salvando mensagem no banco...');
  await prisma.mensagemIA.create({
    data: {
      instanciaId: batch.instanciaId,
      remetente: batch.remetente,
      conteudo: mensagemUnificada,
      resposta: resultado.text,
    },
  });
  console.log('[processamento] mensagem salva no banco');

  if (!resultado.text) {
    console.log('[processamento] resposta da IA vazia, nao enviando nada');
    return;
  }

  // Mensagens fixas (boas-vindas, oferta e formulario de pedido manual) vem prontas e ja
  // divididas: cada item e uma bolha, enviada literalmente. Nao passam pela sanitizacao nem
  // pelo corte de 420 chars justamente para chegarem identicas ao texto aprovado.
  const mensagensProntas = Array.isArray((resultado as any).mensagens)
    ? ((resultado as any).mensagens as string[]).map((item) => String(item || '').trim()).filter(Boolean)
    : null;

  if (mensagensProntas && mensagensProntas.length > 0) {
    console.log('[envio] enviando mensagens fixas', { total: mensagensProntas.length });
    let algumaFalhou = false;
    for (let i = 0; i < mensagensProntas.length; i++) {
      if (batch.lastMetaMessageId) {
        await whatsappService.enviarTypingIndicator(batch.instanciaId, batch.lastMetaMessageId);
      }
      // enviarMensagem devolve false em vez de lancar (rate limit, token expirado, numero invalido).
      const enviado = await whatsappService
        .enviarMensagem(batch.instanciaId, batch.remetente, mensagensProntas[i])
        .catch((err) => {
          console.error('[envio] erro ao enviar mensagem fixa', { index: i, err });
          return false;
        });
      if (!enviado) algumaFalhou = true;
      console.log('[envio] mensagem fixa', { index: i, enviado });
      if (i < mensagensProntas.length - 1) await sleep(1200);
    }

    // Saudacao que nao chegou: devolve o direito de saudar para o cliente nao ficar sem boas-vindas.
    if (algumaFalhou && (resultado as any).ehSaudacao) {
      console.warn('[envio] saudacao falhou, liberando claim para nova tentativa', {
        instanciaId: batch.instanciaId,
        remetente: batch.remetente,
      });
      await liberarSaudacao(batch.instanciaId, batch.remetente);
    }
    return;
  }

  const imageUrls = extrairImageUrls(resultado.text);
  const { text: textoSemPix, pixPayloads } = extrairPixPayloads(removerImageUrls(resultado.text, imageUrls));
  const textoSanitizado = sanitizeWhatsappText(textoSemPix).trim();

  if (!textoSanitizado && imageUrls.length === 0) {
    console.log('[processamento] texto sanitizado vazio, nao enviando');
    return;
  }

  if (textoSanitizado) {
    const chunks = splitMessage(textoSanitizado, 420);
    console.log('[envio] enviando texto em chunks', { totalChunks: chunks.length });
    for (let i = 0; i < chunks.length; i++) {
      if (batch.lastMetaMessageId) {
        console.log('[typing] enviando typing antes do chunk', { index: i });
        await whatsappService.enviarTypingIndicator(batch.instanciaId, batch.lastMetaMessageId);
      }
      console.log('[envio] enviando chunk', { index: i, preview: chunks[i].slice(0, 80) });
      await whatsappService.enviarMensagem(batch.instanciaId, batch.remetente, chunks[i]);
      console.log('[envio] chunk enviado com sucesso', { index: i });
      if (chunks.length > 1 || imageUrls.length > 0) await sleep(1000);
    }
  }

  if (pixPayloads.length > 0) {
    console.log('[envio] enviando payloads PIX separados', { quantidade: pixPayloads.length });
    for (let i = 0; i < pixPayloads.length; i++) {
      if (batch.lastMetaMessageId) {
        console.log('[typing] enviando typing antes do payload PIX', { index: i });
        await whatsappService.enviarTypingIndicator(batch.instanciaId, batch.lastMetaMessageId);
      }
      console.log('[envio] enviando payload PIX isolado', { index: i, preview: pixPayloads[i].slice(0, 40) });
      await whatsappService.enviarMensagem(batch.instanciaId, batch.remetente, pixPayloads[i]);
      console.log('[envio] payload PIX enviado com sucesso', { index: i });
      if (imageUrls.length > 0 || i < pixPayloads.length - 1) await sleep(1000);
    }
  }

  if (imageUrls.length > 0) {
    console.log('[envio] enviando imagens', { quantidade: imageUrls.length });
    const captionBase = extrairLegendaFoto(textoSanitizado) || 'QR Code do PIX';
    for (let i = 0; i < imageUrls.length; i++) {
      if (batch.lastMetaMessageId) {
        console.log('[typing] enviando typing antes de imagem', { index: i });
        await whatsappService.enviarTypingIndicator(batch.instanciaId, batch.lastMetaMessageId);
      }
      const caption = i === 0 && !textoSanitizado ? captionBase : undefined;
      console.log('[envio] enviando imagem', { index: i, url: imageUrls[i].slice(0, 80), caption: caption?.slice(0, 50) });
      const sent = await whatsappService.enviarImagem(batch.instanciaId, batch.remetente, imageUrls[i], caption);
      if (!sent) {
        console.error('[envio] falha ao enviar imagem, enviando fallback');
        notificarErroCritico('ia', 'Falha ao enviar imagem (ex: QR Code do PIX) pelo WhatsApp para o cliente.', {
          detalhes: { instanciaId: batch.instanciaId, remetente: batch.remetente },
        });
        await whatsappService.enviarMensagem(batch.instanciaId, batch.remetente, 'Nao consegui enviar a imagem agora. Quer que eu tente novamente?');
      } else {
        console.log('[envio] imagem enviada com sucesso', { index: i });
      }
      await sleep(700);
    }
  }

  console.log('[processamento] fluxo completo finalizado', { remetente: batch.remetente });
}

async function extrairMensagemWebhook(
  body: any,
  req: Request,
  tipoAgenteForcado?: 'GESTAO' | 'ATENDIMENTO',
) {
  let remetente = '';
  let mensagem = '';
  let instanciaId = '';
  let isFromMe = false;
  let metaMessageId: string | undefined;
  let mediaTipo: 'AUDIO' | 'IMAGEM' | undefined;
  let mediaId: string | undefined;

  // Meta Official format.
  if (body?.object === 'whatsapp_business_account' || body?.entry) {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];
    if (!message) {
      // Webhooks de status (sent/delivered/read/failed) nao tem messages. Logamos falhas para diagnostico.
      const statuses = value?.statuses;
      if (Array.isArray(statuses)) {
        for (const st of statuses) {
          if (st?.status === 'failed' || st?.errors) {
            console.error('[webhook] Meta status FAILED no envio', {
              recipient: st?.recipient_id,
              status: st?.status,
              errors: JSON.stringify(st?.errors || []),
            });
          } else {
            console.log('[webhook] Meta status', { recipient: st?.recipient_id, status: st?.status });
          }
        }
      }
      return null;
    }

    remetente = normalizePhone(message.from || '');
    mensagem = String(message.text?.body || message.caption || '').trim();
    metaMessageId = message.id || undefined;

    // Deteccao de midia (audio/imagem) para download e transcricao posterior.
    const tipoMsg = String(message.type || '').toLowerCase();
    if (tipoMsg === 'audio' || tipoMsg === 'voice') {
      mediaTipo = 'AUDIO';
      mediaId = message.audio?.id || message.voice?.id;
    } else if (tipoMsg === 'image') {
      mediaTipo = 'IMAGEM';
      mediaId = message.image?.id;
      mensagem = String(message.image?.caption || message.caption || '').trim();
    }

    const phoneNumberId = value?.metadata?.phone_number_id;
    if (phoneNumberId) {
      const instancia = await prisma.instanciaWhatsApp.findFirst({
        where: { metaPhoneNumberId: phoneNumberId },
      });
      if (instancia) instanciaId = instancia.id;
    }

    // Fallback para Meta: quando o payload de teste nao bate com phone_number_id real,
    // tentamos resolver pela rota (/atendimento|/gestao) com seguranca.
    if (!instanciaId && tipoAgenteForcado) {
      const conectadas = await prisma.instanciaWhatsApp.findMany({
        where: {
          provedor: 'META_OFICIAL',
          tipo: tipoAgenteForcado,
          status: 'CONECTADO',
        },
        select: { id: true },
        orderBy: { atualizadoEm: 'desc' },
      });

      if (conectadas.length === 1) {
        instanciaId = conectadas[0].id;
        console.log('[webhook] instancia Meta resolvida por fallback (conectada)', { tipoAgenteForcado, instanciaId });
      } else if (conectadas.length > 1) {
        console.warn('[webhook] multiplas instancias Meta conectadas para o tipo; nao foi possivel resolver automaticamente', {
          tipoAgenteForcado,
          quantidade: conectadas.length,
        });
      } else if (conectadas.length === 0) {
        const candidatas = await prisma.instanciaWhatsApp.findMany({
          where: {
            provedor: 'META_OFICIAL',
            tipo: tipoAgenteForcado,
          },
          select: { id: true },
          orderBy: { atualizadoEm: 'desc' },
        });
        if (candidatas.length === 1) {
          instanciaId = candidatas[0].id;
          console.log('[webhook] instancia Meta resolvida por fallback (tipo unico)', { tipoAgenteForcado, instanciaId });
        } else if (candidatas.length > 1) {
          console.warn('[webhook] multiplas instancias Meta para o tipo; configure phone_number_id para evitar ambiguidade', {
            tipoAgenteForcado,
            quantidade: candidatas.length,
          });
        }
      }
    }
  } else if (body?.event === 'messages' || body?.event === 'status' || body?.event === 'disconnected' || body?.message || body?.data) {
    // UZapi format.
    const msg = body.message || body.data || body;
    isFromMe = Boolean(msg.fromMe || msg.isFromMe || msg.from_api || msg.fromApi);
    const isGroupMessage = Boolean(msg.isGroup || String(msg.chatid || '').includes('-'));

    remetente =
      msg.sender_pn ||
      msg.sender ||
      msg.from ||
      msg.phone ||
      (!isGroupMessage ? msg.chatid : '') ||
      '';
    remetente = normalizePhone(remetente);
    mensagem = String(msg.text || msg.body || msg.message || msg.content || '').trim();

    const token =
      String(body?.token || body?.instance?.token || body?.data?.token || msg?.token || '').trim() ||
      String(req.headers['x-instance-token'] || req.headers['token'] || '').trim();
    if (token) {
      const instancia = await prisma.instanciaWhatsApp.findFirst({ where: { uzapiToken: token } });
      if (instancia) instanciaId = instancia.id;
    }

    if (!instanciaId) {
      const instancia = await prisma.instanciaWhatsApp.findFirst({
        where: {
          provedor: 'UZAPI',
          status: 'CONECTADO',
          ...(tipoAgenteForcado ? { tipo: tipoAgenteForcado } : {}),
        },
      });
      if (instancia) instanciaId = instancia.id;
    }

    if (instanciaId && (body?.event === 'status' || body?.event === 'disconnected' || body?.status)) {
      await atualizarStatusInstanciaUZapi(instanciaId, body, msg);
    }
  } else {
    return null;
  }

  return {
    remetente,
    mensagem,
    instanciaId,
    isFromMe,
    metaMessageId,
    mediaTipo,
    mediaId,
  };
}

async function atualizarStatusInstanciaUZapi(instanciaId: string, body: any, msg: any) {
  const rawStatus = String(
    body?.status ||
      body?.state ||
      body?.data?.status ||
      body?.instance?.status ||
      msg?.status ||
      ''
  ).toLowerCase();

  const isConnected =
    rawStatus === 'connected' ||
    rawStatus === 'open' ||
    body?.connected === true ||
    body?.status?.connected === true ||
    msg?.connected === true;

  const qrCode =
    body?.qrcode ||
    body?.qr ||
    body?.qrCode ||
    body?.base64 ||
    body?.instance?.qrcode ||
    body?.data?.qrcode ||
    null;

  let status = 'DESCONECTADO';
  if (isConnected) status = 'CONECTADO';
  else if (qrCode || rawStatus === 'qr' || rawStatus === 'qr_required' || rawStatus === 'connecting') status = 'QR_CODE';

  await prisma.instanciaWhatsApp.update({
    where: { id: instanciaId },
    data: {
      status,
      ...(status === 'CONECTADO' ? { qrCode: null } : qrCode ? { qrCode: String(qrCode) } : {}),
    },
  });
}

function consolidarMensagens(messages: string[]) {
  const valid = (messages || [])
    .map((msg) => String(msg || '').trim())
    .filter(Boolean);
  if (!valid.length) return '';
  return valid.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizePhone(value: string) {
  if (!value) return '';
  let normalized = String(value).trim();
  if (normalized.includes('@')) normalized = normalized.split('@')[0];
  return normalized.replace(/[^0-9]/g, '');
}

function extrairImageUrls(text: string): string[] {
  if (!text) return [];
  const urls = text.match(/https?:\/\/[^\s)]+/gi) || [];
  const unique = Array.from(new Set(urls.map((u) => u.trim())));
  return unique.filter((url) => {
    const lower = url.toLowerCase();
    return (
      lower.includes('/uploads/') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.png') ||
      lower.endsWith('.webp') ||
      lower.endsWith('.gif')
    );
  });
}

function removerImageUrls(text: string, imageUrls: string[]): string {
  if (!text) return '';
  let out = text;
  for (const url of imageUrls) {
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'g'), '');
  }
  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sanitizeWhatsappText(text: string): string {
  if (!text) return '';
  return text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/!\[[^\]]*\]\(\)/g, '')
    .replace(/\*/g, '')
    .replace(/_{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isPixPayloadLine(line: string): boolean {
  const normalized = String(line || '').trim();
  if (!normalized) return false;
  if (/\s/.test(normalized)) return false;
  if (normalized.length < 40) return false;
  return /^000201/i.test(normalized);
}

function extrairPixPayloads(text: string): { text: string; pixPayloads: string[] } {
  if (!text) return { text: '', pixPayloads: [] };

  const linhas = String(text).split('\n');
  const pixPayloads: string[] = [];
  const restantes: string[] = [];

  for (const linha of linhas) {
    const linhaTrim = linha.trim();
    if (isPixPayloadLine(linhaTrim)) {
      pixPayloads.push(linhaTrim);
      continue;
    }
    restantes.push(linha);
  }

  return {
    text: restantes.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    pixPayloads: Array.from(new Set(pixPayloads)),
  };
}

function extrairLegendaFoto(text: string): string {
  if (!text) return '';
  const firstLine = text.split('\n').map((line) => line.trim()).find(Boolean) || '';
  if (!firstLine) return '';
  return firstLine.slice(0, 120);
}

function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let breakPoint = remaining.lastIndexOf('\n', maxLength);
    if (breakPoint < maxLength * 0.5) breakPoint = remaining.lastIndexOf('. ', maxLength);
    if (breakPoint < maxLength * 0.5) breakPoint = remaining.lastIndexOf(' ', maxLength);
    if (breakPoint < maxLength * 0.3) breakPoint = maxLength;
    chunks.push(remaining.slice(0, breakPoint).trim());
    remaining = remaining.slice(breakPoint).trim();
  }
  return chunks;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default router;
