import { prisma } from '../lib/prisma';

function soDigitos(s?: string) {
  return String(s || '').replace(/\D/g, '');
}

/**
 * Isencao de frete individual, configurada no cadastro do cliente.
 * Zera o frete do pedido, mas NAO amplia a area de entrega: endereco fora do
 * raio de delivery continua recusado.
 *
 * Identifica o cliente por id quando o pedido ja tem um vinculo; no cardapio
 * digital (sem login) cai para telefone/email, que e como o proprio cardapio
 * ja reconhece clientes recorrentes.
 */
export async function clienteTemEntregaGratis(params: {
  clienteId?: string;
  telefone?: string;
  email?: string;
}) {
  if (params.clienteId) {
    const cliente = await prisma.cliente.findUnique({
      where: { id: params.clienteId },
      select: { entregaGratis: true },
    });
    return Boolean(cliente?.entregaGratis);
  }

  const tel = soDigitos(params.telefone);
  const email = String(params.email || '').trim().toLowerCase();

  const or: any[] = [];
  if (tel.length >= 8) or.push({ telefone: { contains: tel.slice(-8) } });
  if (email) or.push({ email: { equals: email, mode: 'insensitive' } });
  if (or.length === 0) return false;

  const cliente = await prisma.cliente.findFirst({
    where: { AND: [{ entregaGratis: true }, { OR: or }] },
    select: { id: true },
  });
  return Boolean(cliente);
}

export async function listarClientes(filtros: { busca?: string; ativo?: string }) {
  const where: any = {};
  if (filtros.ativo !== undefined) where.ativo = filtros.ativo === 'true';
  if (filtros.busca) {
    where.OR = [
      { nome: { contains: filtros.busca } },
      { telefone: { contains: filtros.busca } },
      { email: { contains: filtros.busca } },
    ];
  }

  const clientes = await prisma.cliente.findMany({
    where,
    include: {
      _count: { select: { pedidos: true } },
      pedidos: {
        orderBy: { criadoEm: 'desc' },
        take: 1,
        select: { criadoEm: true, total: true, status: true },
      },
    },
    orderBy: { nome: 'asc' },
  });

  return clientes.map((c) => {
    const totalGasto = 0; // calculado no detalhe
    const ultimoPedido = c.pedidos[0]?.criadoEm ?? null;
    const diasSemPedido = ultimoPedido
      ? Math.floor((Date.now() - new Date(ultimoPedido).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    return {
      ...c,
      totalPedidos: c._count.pedidos,
      ultimoPedido,
      diasSemPedido,
      recorrente: c._count.pedidos >= 3,
      inativo: diasSemPedido !== null ? diasSemPedido > 30 : c._count.pedidos > 0,
    };
  });
}

export async function buscarCliente(id: string) {
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      pedidos: {
        include: { itens: { include: { produto: { select: { nome: true, categoria: true } } } } },
        orderBy: { criadoEm: 'desc' },
      },
      interacoes: { orderBy: { criadoEm: 'desc' }, take: 50 },
    },
  });
  if (!cliente) throw { status: 404, message: 'Cliente não encontrado.' };

  const pedidosEntregues = cliente.pedidos.filter((p) => p.status === 'ENTREGUE');
  const totalGasto = pedidosEntregues.reduce((s, p) => s + p.total, 0);
  const ticketMedio = pedidosEntregues.length > 0 ? totalGasto / pedidosEntregues.length : 0;

  const ultimoPedido = cliente.pedidos[0]?.criadoEm ?? null;
  const diasSemPedido = ultimoPedido
    ? Math.floor((Date.now() - new Date(ultimoPedido).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Produtos mais comprados
  const produtoContagem: Record<string, { nome: string; categoria: string; qtd: number }> = {};
  for (const p of pedidosEntregues) {
    for (const item of p.itens) {
      const nome = item.produto?.nome ?? 'Desconhecido';
      const cat = item.produto?.categoria ?? '';
      if (!produtoContagem[nome]) produtoContagem[nome] = { nome, categoria: cat, qtd: 0 };
      produtoContagem[nome].qtd += item.quantidade;
    }
  }
  const topProdutos = Object.values(produtoContagem).sort((a, b) => b.qtd - a.qtd).slice(0, 5);

  // Frequência média (dias entre pedidos)
  let frequenciaMedia: number | null = null;
  if (cliente.pedidos.length >= 2) {
    const datas = cliente.pedidos.map(p => new Date(p.criadoEm).getTime()).sort((a, b) => a - b);
    const intervalos = datas.slice(1).map((d, i) => (d - datas[i]) / (1000 * 60 * 60 * 24));
    frequenciaMedia = Math.round(intervalos.reduce((s, v) => s + v, 0) / intervalos.length);
  }

  return {
    ...cliente,
    totalGasto,
    ticketMedio,
    totalPedidos: cliente.pedidos.length,
    pedidosEntregues: pedidosEntregues.length,
    ultimoPedido,
    diasSemPedido,
    recorrente: cliente.pedidos.length >= 3,
    inativo: diasSemPedido !== null ? diasSemPedido > 30 : false,
    topProdutos,
    frequenciaMedia,
  };
}

export async function criarCliente(data: {
  nome: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  cpf?: string;
  dataNasc?: string;
  observacoes?: string;
  entregaGratis?: boolean;
}) {
  return prisma.cliente.create({ data });
}

export async function atualizarCliente(id: string, data: Partial<{
  nome: string;
  telefone: string;
  email: string;
  endereco: string;
  bairro: string;
  cidade: string;
  cpf: string;
  dataNasc: string;
  observacoes: string;
  ativo: boolean;
  entregaGratis: boolean;
}>) {
  const cliente = await prisma.cliente.findUnique({ where: { id } });
  if (!cliente) throw { status: 404, message: 'Cliente não encontrado.' };
  return prisma.cliente.update({ where: { id }, data });
}

export async function adicionarInteracao(clienteId: string, tipo: string, descricao: string) {
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente) throw { status: 404, message: 'Cliente não encontrado.' };
  return prisma.interacaoCliente.create({ data: { clienteId, tipo, descricao } });
}

export async function kpisClientes() {
  const clientes = await prisma.cliente.findMany({
    include: {
      _count: { select: { pedidos: true } },
      pedidos: { orderBy: { criadoEm: 'desc' }, take: 1, select: { criadoEm: true } },
    },
  });

  const total = clientes.length;
  const recorrentes = clientes.filter(c => c._count.pedidos >= 3).length;
  const inativos = clientes.filter(c => {
    const ultimo = c.pedidos[0]?.criadoEm;
    if (!ultimo) return c._count.pedidos > 0;
    return (Date.now() - new Date(ultimo).getTime()) / (1000 * 60 * 60 * 24) > 30;
  }).length;
  const novos30dias = clientes.filter(c => {
    return (Date.now() - new Date(c.criadoEm).getTime()) / (1000 * 60 * 60 * 24) <= 30;
  }).length;

  return { total, recorrentes, inativos, novos30dias, ativos: total - inativos };
}
