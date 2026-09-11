import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { config } from '../config/env';
import { definirAccessTokenMercadoPago } from './mercado-pago.service';

/**
 * "Conectar Mercado Pago" via OAuth.
 *
 * A loja clica em conectar, autoriza na conta dela e o sistema guarda o token.
 * O dinheiro das vendas cai na conta do lojista; o aplicativo (client_id/secret
 * no .env) so intermedia a conexao. Guardamos tambem o refresh_token para
 * renovar sozinho quando o access token estiver perto de vencer (~180 dias).
 *
 * Este modulo e a UNICA porta de entrada do token: ele le/grava no banco e
 * avisa o mercado-pago.service (que mantem o valor em memoria).
 */

const STATE_TTL_SEGUNDOS = 15 * 60;

type TokenOAuth = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  publicKey: string;
  expiresIn: number;
};

async function configuracaoLoja() {
  const existente = await prisma.configuracaoLoja.findFirst();
  return existente ?? (await prisma.configuracaoLoja.create({ data: {} }));
}

async function chamarOAuthToken(body: Record<string, string>): Promise<TokenOAuth> {
  const res = await fetch(`${config.mercadoPagoApiBaseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) {
    const detalhe = data?.message || data?.error || `HTTP ${res.status}`;
    throw { status: 400, message: `Falha ao conectar com o Mercado Pago: ${detalhe}` };
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    userId: String(data.user_id ?? ''),
    publicKey: data.public_key || '',
    expiresIn: Number(data.expires_in || 0),
  };
}

export function iniciarConexao(): { url: string } {
  if (!config.mercadoPagoClientId || !config.mercadoPagoClientSecret) {
    throw { status: 400, message: 'A conexao com o Mercado Pago ainda nao foi configurada no servidor.' };
  }
  const state = jwt.sign({ tipo: 'mp_oauth' }, config.jwtSecret, { expiresIn: STATE_TTL_SEGUNDOS });
  const params = new URLSearchParams({
    client_id: config.mercadoPagoClientId,
    response_type: 'code',
    platform_id: 'mp',
    state,
    redirect_uri: config.mercadoPagoOauthRedirectUri,
  });
  return { url: `https://auth.mercadopago.com.br/authorization?${params.toString()}` };
}

export async function finalizarConexao(code: string, state: string) {
  try {
    const payload = jwt.verify(state, config.jwtSecret) as any;
    if (payload?.tipo !== 'mp_oauth') throw new Error('state invalido');
  } catch {
    throw { status: 400, message: 'Sessao de conexao expirada ou invalida. Conecte de novo.' };
  }

  const token = await chamarOAuthToken({
    client_id: config.mercadoPagoClientId,
    client_secret: config.mercadoPagoClientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.mercadoPagoOauthRedirectUri,
  });

  const loja = await configuracaoLoja();
  await prisma.configuracaoLoja.update({
    where: { id: loja.id },
    data: {
      mercadoPagoAccessToken: token.accessToken,
      mercadoPagoRefreshToken: token.refreshToken || null,
      mercadoPagoUserId: token.userId || null,
      mercadoPagoPublicKey: token.publicKey || null,
      mercadoPagoTokenExpiraEm: token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000) : null,
    },
  });
  definirAccessTokenMercadoPago(token.accessToken);
  return { conectado: true, userId: token.userId };
}

export async function desconectar() {
  const loja = await configuracaoLoja();
  await prisma.configuracaoLoja.update({
    where: { id: loja.id },
    data: {
      mercadoPagoAccessToken: null,
      mercadoPagoRefreshToken: null,
      mercadoPagoUserId: null,
      mercadoPagoPublicKey: null,
      mercadoPagoTokenExpiraEm: null,
    },
  });
  definirAccessTokenMercadoPago(null);
  return { conectado: false };
}

export async function statusConexao() {
  const loja = await configuracaoLoja();
  return {
    conectado: Boolean(loja.mercadoPagoAccessToken),
    userId: loja.mercadoPagoUserId,
    expiraEm: loja.mercadoPagoTokenExpiraEm,
    // Sem conexao mas com token no .env: segue funcionando do jeito antigo.
    usandoTokenDoServidor: !loja.mercadoPagoAccessToken && Boolean(config.mercadoPagoAccessToken),
  };
}

/**
 * Le o token do banco, renova pelo refresh se estiver perto de vencer e coloca o
 * valor em memoria. Chamado no boot do servidor e periodicamente.
 */
export async function sincronizarToken() {
  try {
    const loja = await configuracaoLoja();
    const atual = (loja.mercadoPagoAccessToken || '').trim();
    if (!atual) {
      definirAccessTokenMercadoPago(null);
      return;
    }

    const expiraEm = loja.mercadoPagoTokenExpiraEm ? new Date(loja.mercadoPagoTokenExpiraEm).getTime() : 0;
    const vaiExpirarEmBreve = expiraEm > 0 && expiraEm - Date.now() < 24 * 60 * 60 * 1000;

    if (!loja.mercadoPagoRefreshToken || !vaiExpirarEmBreve) {
      definirAccessTokenMercadoPago(atual);
      return;
    }

    const novo = await chamarOAuthToken({
      client_id: config.mercadoPagoClientId,
      client_secret: config.mercadoPagoClientSecret,
      grant_type: 'refresh_token',
      refresh_token: loja.mercadoPagoRefreshToken,
    });
    await prisma.configuracaoLoja.update({
      where: { id: loja.id },
      data: {
        mercadoPagoAccessToken: novo.accessToken,
        mercadoPagoRefreshToken: novo.refreshToken || loja.mercadoPagoRefreshToken,
        mercadoPagoTokenExpiraEm: novo.expiresIn ? new Date(Date.now() + novo.expiresIn * 1000) : null,
      },
    });
    definirAccessTokenMercadoPago(novo.accessToken);
    console.log('[mercado-pago] token OAuth renovado');
  } catch (err) {
    console.error('[mercado-pago] falha ao sincronizar token OAuth', err);
  }
}
