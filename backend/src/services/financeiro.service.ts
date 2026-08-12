import { prisma } from '../lib/prisma';
import { buildBrasiliaDateRange, toBrasiliaDateKey } from '../lib/brasiliaDate';

export async function listarLancamentos(filtros: {
  tipo?: string;
  categoria?: string;
  dataInicio?: string;
  dataFim?: string;
  page?: number;
  limit?: number;
}) {
  const { tipo, categoria, dataInicio, dataFim, page = 1, limit = 50 } = filtros;
  const where: any = {};
  if (tipo) where.tipo = tipo;
  if (categoria) where.categoria = categoria;
  const periodoBrasilia = buildBrasiliaDateRange(dataInicio, dataFim);
  if (periodoBrasilia) {
    where.data = periodoBrasilia;
  }

  const [lancamentos, total] = await Promise.all([
    prisma.lancamentoFinanceiro.findMany({
      where,
      orderBy: { data: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.lancamentoFinanceiro.count({ where }),
  ]);

  return { lancamentos, total, page, limit };
}

export async function criarLancamento(data: {
  tipo: string;
  categoria: string;
  descricao: string;
  valor: number;
  data: string;
  pedidoId?: string;
}) {
  return prisma.lancamentoFinanceiro.create({
    data: { ...data, data: new Date(data.data) },
  });
}

export async function resumoFinanceiro(dataInicio?: string, dataFim?: string) {
  const where: any = {};
  const periodoBrasilia = buildBrasiliaDateRange(dataInicio, dataFim);
  if (periodoBrasilia) {
    where.data = periodoBrasilia;
  }

  const lancamentos = await prisma.lancamentoFinanceiro.findMany({ where });

  const receita = lancamentos.filter((l) => l.tipo === 'RECEITA').reduce((s, l) => s + l.valor, 0);
  const custos = lancamentos.filter((l) => l.tipo === 'CUSTO').reduce((s, l) => s + l.valor, 0);
  const margem = receita - custos;
  const margemPct = receita > 0 ? (margem / receita) * 100 : 0;

  // Pedidos no período
  const wherePedidos: any = { status: 'ENTREGUE' };
  if (periodoBrasilia) {
    wherePedidos.criadoEm = periodoBrasilia;
  }
  const pedidos = await prisma.pedido.findMany({ where: wherePedidos, select: { total: true } });
  const ticketMedio = pedidos.length > 0 ? pedidos.reduce((s, p) => s + p.total, 0) / pedidos.length : 0;

  // Receita por dia no período selecionado
  const receitaDiaria = await prisma.lancamentoFinanceiro.findMany({
    where: {
      tipo: 'RECEITA',
      ...(where.data ? { data: where.data } : {}),
    },
    orderBy: { data: 'asc' },
  });

  const porDia: Record<string, number> = {};
  for (const l of receitaDiaria) {
    const dia = toBrasiliaDateKey(l.data);
    porDia[dia] = (porDia[dia] || 0) + l.valor;
  }
  const graficoDiario = Object.entries(porDia).map(([data, valor]) => ({ data, valor }));

  return { receita, custos, margem, margemPct, ticketMedio, totalPedidos: pedidos.length, graficoDiario };
}
