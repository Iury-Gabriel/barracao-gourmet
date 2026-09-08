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
      // Ultima reclamacao aberta: a tela de Recorrencia separa quem reclamou
      // para a equipe reativar esse cliente antes que ele va embora.
      interacoes: {
        where: { tipo: 'RECLAMACAO' },
        orderBy: { criadoEm: 'desc' },
        take: 1,
        select: { descricao: true, criadoEm: true },
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
      // 10 pedidos e o corte que a casa usa para o agradecimento com cupom.
      fiel: c._count.pedidos >= 10,
      inativo: diasSemPedido !== null ? diasSemPedido > 30 : c._count.pedidos > 0,
      reclamacao: c.interacoes[0]
        ? { descricao: c.interacoes[0].descricao, criadoEm: c.interacoes[0].criadoEm }
        : null,
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
  tipoEndereco?: string;
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
  tipoEndereco: string;
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

/**
 * Cupom de agradecimento para cliente fiel.
 *
 * Descobre o prato que ele mais pede e cria um cupom de uso unico com o nome
 * dele no codigo. O prato vem junto para a mensagem citar o que ele gosta, que
 * e o que faz a oferta parecer dirigida a ele e nao um disparo generico.
 */
export async function gerarCupomFidelidade(clienteId: string) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { id: true, nome: true, telefone: true, _count: { select: { pedidos: true } } },
  });
  if (!cliente) throw { status: 404, message: 'Cliente nao encontrado.' };

  const agregado = await prisma.itemPedido.groupBy({
    by: ['produtoId'],
    where: { pedido: { clienteId } },
    _sum: { quantidade: true },
    orderBy: { _sum: { quantidade: 'desc' } },
    take: 1,
  });

  let produtoFavorito: string | null = null;
  if (agregado[0]?.produtoId) {
    const produto = await prisma.produto.findUnique({
      where: { id: agregado[0].produtoId },
      select: { nome: true },
    });
    produtoFavorito = produto?.nome ?? null;
  }

  // Codigo curto e ditavel por telefone, com sufixo aleatorio para nao repetir
  // entre dois clientes de mesmo primeiro nome.
  const base = (cliente.nome || 'CLIENTE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
    .slice(0, 6) || 'CLIENTE';

  let codigo = '';
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const sufixo = Math.floor(1000 + Math.random() * 9000);
    const candidato = `OBRIGADO${base}${sufixo}`.slice(0, 20);
    const existe = await prisma.cupom.findUnique({ where: { codigo: candidato } });
    if (!existe) {
      codigo = candidato;
      break;
    }
  }
  if (!codigo) throw { status: 500, message: 'Nao foi possivel gerar um codigo de cupom.' };

  const cupom = await prisma.cupom.create({
    data: {
      codigo,
      tipo: 'PERCENTUAL',
      valor: 10,
      ativo: true,
      // Uso unico: e um agradecimento para aquele cliente, nao uma campanha.
      limiteUsos: 1,
      limitePorCliente: 1,
    },
  });

  await prisma.interacaoCliente.create({
    data: {
      clienteId,
      tipo: 'REATIVACAO',
      descricao: `Cupom de fidelidade ${codigo} (10% de desconto) gerado apos ${cliente._count.pedidos} pedidos.`,
    },
  });

  return {
    codigo: cupom.codigo,
    percentual: cupom.valor,
    produtoFavorito,
    totalPedidos: cliente._count.pedidos,
    nome: cliente.nome,
    telefone: cliente.telefone,
  };
}
