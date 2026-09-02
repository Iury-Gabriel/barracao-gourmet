import { prisma } from '../lib/prisma';
import { config } from '../config/env';
import { redis, connectRedisIfNeeded, isRedisReady } from '../lib/redis';
import { COORDENADAS_BASE_LOJA, calcularDistanciaHaversineKm } from '../lib/frete';

/**
 * Rastreio de entrega.
 *
 * A posicao do entregador NAO vai para o banco: fica no Redis com expiracao
 * curta e some sozinha. Assim nao se cria historico permanente de localizacao
 * de funcionario, que seria dado pessoal sensivel sem necessidade operacional.
 */

// Depois disso a posicao expira. Cobre folgadamente o intervalo de envio (15s)
// mais uma perda momentanea de sinal.
const TTL_POSICAO_SEGUNDOS = 180;

// Acima disso a posicao ainda existe, mas o cliente ve "sem sinal" em vez de um
// ponto parado fingindo estar ao vivo. E a limitacao real do GPS no navegador:
// com a tela bloqueada o envio para.
export const SEGUNDOS_ATE_POSICAO_ANTIGA = 60;

export type PosicaoEntrega = {
  lat: number;
  lon: number;
  precisaoM: number | null;
  atualizadoEm: string;
};

function chavePosicao(pedidoId: string) {
  return `${config.redisKeyPrefix}:entrega:pos:${pedidoId}`;
}

/** Entregador vinculado ao usuario logado. Null se o login nao for de entregador. */
export async function entregadorDoUsuario(usuarioId: string) {
  return prisma.entregador.findUnique({ where: { usuarioId } });
}

const SELECT_PEDIDO_ENTREGA = {
  id: true,
  numero: true,
  status: true,
  tipo: true,
  total: true,
  nomeCliente: true,
  telefoneCliente: true,
  enderecoEntrega: true,
  cepEntrega: true,
  observacoes: true,
  criadoEm: true,
  entregadorId: true,
  cliente: { select: { nome: true, telefone: true } },
  itens: { select: { quantidade: true, variacaoNome: true, produto: { select: { nome: true } } } },
} as const;

/**
 * O que o entregador ve no celular: o que ja e dele e o que esta pronto para
 * sair. So DELIVERY, porque retirada e balcao nao tem entrega.
 */
export async function listarEntregasDoEntregador(entregadorId: string) {
  const [minhas, disponiveis] = await Promise.all([
    prisma.pedido.findMany({
      where: { entregadorId, status: 'EM_ENTREGA' },
      select: SELECT_PEDIDO_ENTREGA,
      orderBy: { criadoEm: 'asc' },
    }),
    prisma.pedido.findMany({
      where: { tipo: 'DELIVERY', status: 'PRONTO', entregadorId: null },
      select: SELECT_PEDIDO_ENTREGA,
      orderBy: { criadoEm: 'asc' },
    }),
  ]);
  return { minhas, disponiveis };
}

/** O entregador pega o pedido e ele sai para entrega. */
export async function assumirEntrega(pedidoId: string, entregadorId: string) {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    select: { id: true, status: true, tipo: true, entregadorId: true },
  });
  if (!pedido) throw { status: 404, message: 'Pedido nao encontrado.' };
  if (pedido.tipo !== 'DELIVERY') throw { status: 400, message: 'Esse pedido nao e de entrega.' };
  if (pedido.entregadorId && pedido.entregadorId !== entregadorId) {
    throw { status: 409, message: 'Outro entregador ja pegou esse pedido.' };
  }
  if (['ENTREGUE', 'CANCELADO'].includes(pedido.status)) {
    throw { status: 400, message: 'Esse pedido ja foi encerrado.' };
  }

  return prisma.pedido.update({
    where: { id: pedidoId },
    data: { entregadorId, status: 'EM_ENTREGA' },
    select: SELECT_PEDIDO_ENTREGA,
  });
}

export async function concluirEntrega(pedidoId: string, entregadorId: string) {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    select: { id: true, entregadorId: true },
  });
  if (!pedido) throw { status: 404, message: 'Pedido nao encontrado.' };
  if (pedido.entregadorId !== entregadorId) {
    throw { status: 403, message: 'Esse pedido nao esta com voce.' };
  }

  await limparPosicao(pedidoId);
  return prisma.pedido.update({
    where: { id: pedidoId },
    data: { status: 'ENTREGUE' },
    select: SELECT_PEDIDO_ENTREGA,
  });
}

export async function registrarPosicao(
  pedidoId: string,
  entregadorId: string,
  dados: { lat: number; lon: number; precisaoM?: number },
) {
  const lat = Number(dados.lat);
  const lon = Number(dados.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw { status: 400, message: 'Coordenada invalida.' };
  }

  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    select: { entregadorId: true, status: true },
  });
  if (!pedido) throw { status: 404, message: 'Pedido nao encontrado.' };
  if (pedido.entregadorId !== entregadorId) {
    throw { status: 403, message: 'Esse pedido nao esta com voce.' };
  }
  if (pedido.status !== 'EM_ENTREGA') {
    throw { status: 400, message: 'Esse pedido nao esta em rota.' };
  }

  const posicao: PosicaoEntrega = {
    lat,
    lon,
    precisaoM: Number.isFinite(Number(dados.precisaoM)) ? Number(dados.precisaoM) : null,
    atualizadoEm: new Date().toISOString(),
  };

  await connectRedisIfNeeded();
  if (!isRedisReady()) {
    // Sem Redis o rastreio simplesmente nao acontece; o pedido segue normal.
    throw { status: 503, message: 'Rastreio indisponivel agora.' };
  }
  await redis.set(chavePosicao(pedidoId), JSON.stringify(posicao), { EX: TTL_POSICAO_SEGUNDOS });
  return posicao;
}

async function limparPosicao(pedidoId: string) {
  try {
    await connectRedisIfNeeded();
    if (isRedisReady()) await redis.del(chavePosicao(pedidoId));
  } catch {
    // Se falhar, a chave expira sozinha pelo TTL.
  }
}

/**
 * Rastreio para o cliente. Devolve so o necessario para o mapa: onde esta o
 * entregador, onde fica a loja e a distancia restante. Nao expoe nome, telefone
 * nem qualquer dado do entregador.
 */
export async function rastrearPedido(pedidoId: string) {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    select: { id: true, numero: true, status: true, tipo: true, enderecoEntrega: true },
  });
  if (!pedido) throw { status: 404, message: 'Pedido nao encontrado.' };

  const base = {
    pedidoId: pedido.id,
    numero: pedido.numero,
    status: pedido.status,
    emRota: pedido.status === 'EM_ENTREGA',
    origem: COORDENADAS_BASE_LOJA,
    enderecoEntrega: pedido.enderecoEntrega,
  };

  if (pedido.status !== 'EM_ENTREGA') {
    return { ...base, posicao: null, posicaoAntiga: false, distanciaKm: null };
  }

  await connectRedisIfNeeded();
  if (!isRedisReady()) return { ...base, posicao: null, posicaoAntiga: false, distanciaKm: null };

  const bruto = await redis.get(chavePosicao(pedidoId));
  if (!bruto) return { ...base, posicao: null, posicaoAntiga: false, distanciaKm: null };

  const posicao: PosicaoEntrega = JSON.parse(bruto);
  const idadeSegundos = (Date.now() - new Date(posicao.atualizadoEm).getTime()) / 1000;

  return {
    ...base,
    posicao,
    // O cliente precisa saber que o ponto pode estar velho, em vez de acreditar
    // que o entregador parou no meio da rua.
    posicaoAntiga: idadeSegundos > SEGUNDOS_ATE_POSICAO_ANTIGA,
    idadeSegundos: Math.round(idadeSegundos),
    distanciaKm: Number(
      calcularDistanciaHaversineKm(
        { lat: posicao.lat, lon: posicao.lon },
        COORDENADAS_BASE_LOJA,
      ).toFixed(2),
    ),
  };
}
