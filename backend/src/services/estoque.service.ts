import { prisma } from '../lib/prisma';
import { normalizeImageUrl } from '../lib/url';
import {
  calcularEstoqueTotalVariacoes,
  encontrarVariacaoPorNome,
  mapearProdutoComEstoqueCalculado,
  produtoControlaEstoquePorVariacao,
} from '../lib/produtoEstoque';

type ProdutoVariacaoInput = {
  nome: string;
  descricao?: string;
  estoque?: number;
  estoqueMinimo?: number;
};

function toNonNegativeInt(value: unknown, fallback = 0) {
  const numero = Number(value);
  if (!Number.isFinite(numero)) return fallback;
  return Math.max(0, Math.trunc(numero));
}

function sanitizeVariacoes(variacoes?: ProdutoVariacaoInput[]) {
  if (!Array.isArray(variacoes)) return undefined;

  return variacoes
    .map((variacao, index) => ({
      nome: (variacao?.nome || '').trim(),
      descricao: variacao?.descricao?.trim() || null,
      ordem: index,
      estoque: toNonNegativeInt(variacao?.estoque),
      estoqueMinimo: toNonNegativeInt(variacao?.estoqueMinimo),
    }))
    .filter((variacao) => variacao.nome.length > 0);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

async function excluirDadosRelacionadosAProdutos(produtoIds: string[]) {
  const ids = uniqueStrings(produtoIds);
  if (ids.length === 0) return;

  const produtos = await prisma.produto.findMany({
    where: { id: { in: ids } },
    select: { id: true, nome: true },
  });
  const idsExistentes = produtos.map((produto) => produto.id);
  if (idsExistentes.length === 0) return;

  const itens = await prisma.itemPedido.findMany({
    where: { produtoId: { in: idsExistentes } },
    select: { pedidoId: true },
  });
  const pedidoIds = uniqueStrings(itens.map((item) => item.pedidoId));

  const pedidos = pedidoIds.length
    ? await prisma.pedido.findMany({
        where: { id: { in: pedidoIds } },
        select: { numero: true },
      })
    : [];

  const filtrosPedidoDescricao = pedidos.map((pedido) => ({
    descricao: { contains: `Pedido #${pedido.numero}` },
  }));
  const filtrosPedidoMotivo = pedidos.map((pedido) => ({
    motivo: { contains: `Pedido #${pedido.numero}` },
  }));

  await prisma.$transaction(async (tx) => {
    if (pedidoIds.length > 0) {
      await tx.lancamentoFinanceiro.deleteMany({
        where: { pedidoId: { in: pedidoIds } },
      });
    }

    if (filtrosPedidoDescricao.length > 0) {
      await tx.interacaoCliente.deleteMany({
        where: { OR: filtrosPedidoDescricao },
      });
    }

    if (filtrosPedidoMotivo.length > 0) {
      await tx.movimentacaoEstoque.deleteMany({
        where: { OR: filtrosPedidoMotivo },
      });
    }

    if (pedidoIds.length > 0) {
      await tx.pedido.deleteMany({
        where: { id: { in: pedidoIds } },
      });
    }

    for (const produto of produtos) {
      await tx.lancamentoFinanceiro.deleteMany({
        where: {
          tipo: 'CUSTO',
          categoria: 'Estoque',
          descricao: `Compra de estoque - ${produto.nome}`,
        },
      });
    }

    await tx.movimentacaoEstoque.deleteMany({
      where: { produtoId: { in: idsExistentes } },
    });

    await tx.produto.deleteMany({
      where: { id: { in: idsExistentes } },
    });
  });
}

export async function listarProdutos(filtros: { categoria?: string; disponivel?: string; alertas?: boolean }) {
  const where: any = {};
  if (filtros.categoria) where.categoria = filtros.categoria;
  if (filtros.disponivel !== undefined) where.disponivel = filtros.disponivel === 'true';

  const produtos = await prisma.produto.findMany({
    where,
    include: { variacoes: { orderBy: { ordem: 'asc' } } },
    orderBy: [{ categoria: 'asc' }, { nome: 'asc' }],
  });

  const produtosComEstoque = produtos.map((produto) => mapearProdutoComEstoqueCalculado(produto));
  if (filtros.alertas) {
    return produtosComEstoque.filter((produto) => Number(produto.estoque || 0) <= Number(produto.estoqueMinimo || 0));
  }

  return produtosComEstoque;
}

export async function buscarProduto(id: string) {
  const produto = await prisma.produto.findUnique({
    where: { id },
    include: {
      variacoes: { orderBy: { ordem: 'asc' } },
      movimentacoes: { orderBy: { criadoEm: 'desc' }, take: 20 },
    },
  });
  if (!produto) throw { status: 404, message: 'Produto nao encontrado.' };
  return mapearProdutoComEstoqueCalculado(produto);
}

export async function criarProduto(data: {
  nome: string;
  descricao?: string;
  categoria: string;
  tipoVariacao?: string;
  controlaEstoquePorVariacao?: boolean;
  preco: number;
  custoMedio?: number;
  custoUltimaCompra?: number;
  estoque?: number;
  estoqueMinimo?: number;
  disponivel?: boolean;
  imagemUrl?: string;
  variacoes?: ProdutoVariacaoInput[];
}) {
  const custoBase = data.custoMedio ?? data.custoUltimaCompra ?? 0;
  const variacoes = sanitizeVariacoes(data.variacoes);
  const controlaEstoque = Boolean(data.controlaEstoquePorVariacao);
  const estoque = controlaEstoque
    ? calcularEstoqueTotalVariacoes(variacoes)
    : toNonNegativeInt(data.estoque);

  return prisma.produto.create({
    data: {
      ...data,
      tipoVariacao: data.tipoVariacao?.trim() || null,
      controlaEstoquePorVariacao: controlaEstoque,
      custoMedio: custoBase,
      custoUltimaCompra: data.custoUltimaCompra ?? custoBase,
      estoque,
      estoqueMinimo: toNonNegativeInt(data.estoqueMinimo, 5),
      imagemUrl: normalizeImageUrl(data.imagemUrl) ?? undefined,
      variacoes: variacoes ? { create: variacoes } : undefined,
    },
    include: { variacoes: { orderBy: { ordem: 'asc' } } },
  });
}

export async function atualizarProduto(id: string, data: Partial<{
  nome: string;
  descricao: string;
  categoria: string;
  tipoVariacao: string;
  controlaEstoquePorVariacao: boolean;
  preco: number;
  custoMedio: number;
  custoUltimaCompra: number;
  estoque: number;
  estoqueMinimo: number;
  disponivel: boolean;
  imagemUrl: string;
  variacoes: ProdutoVariacaoInput[];
}>) {
  const produto = await prisma.produto.findUnique({
    where: { id },
    include: { variacoes: { orderBy: { ordem: 'asc' } } },
  });
  if (!produto) throw { status: 404, message: 'Produto nao encontrado.' };

  const variacoes = sanitizeVariacoes(data.variacoes);
  const controlaEstoque = data.controlaEstoquePorVariacao !== undefined
    ? Boolean(data.controlaEstoquePorVariacao)
    : produto.controlaEstoquePorVariacao;
  const variacoesParaCalculo = variacoes ?? produto.variacoes;
  const estoque = controlaEstoque
    ? calcularEstoqueTotalVariacoes(variacoesParaCalculo)
    : data.estoque;

  return prisma.produto.update({
    where: { id },
    data: {
      ...data,
      tipoVariacao: data.tipoVariacao !== undefined ? data.tipoVariacao?.trim() || null : undefined,
      controlaEstoquePorVariacao: data.controlaEstoquePorVariacao,
      custoMedio: data.custoMedio,
      custoUltimaCompra: data.custoUltimaCompra,
      estoque,
      estoqueMinimo: data.estoqueMinimo !== undefined ? toNonNegativeInt(data.estoqueMinimo) : undefined,
      imagemUrl: data.imagemUrl ? normalizeImageUrl(data.imagemUrl) ?? undefined : data.imagemUrl,
      variacoes: variacoes
        ? {
            deleteMany: {},
            create: variacoes,
          }
        : undefined,
    },
    include: { variacoes: { orderBy: { ordem: 'asc' } } },
  });
}

export async function excluirProduto(id: string) {
  const produto = await prisma.produto.findUnique({ where: { id } });
  if (!produto) throw { status: 404, message: 'Produto nao encontrado.' };

  await excluirDadosRelacionadosAProdutos([id]);
}

export async function registrarMovimentacao(data: {
  produtoId: string;
  variacaoNome?: string;
  tipo: string;
  quantidade: number;
  custoUnitario?: number;
  custoTotal?: number;
  motivo?: string;
}) {
  const produto = await prisma.produto.findUnique({
    where: { id: data.produtoId },
    include: { variacoes: { orderBy: { ordem: 'asc' } } },
  });
  if (!produto) throw { status: 404, message: 'Produto nao encontrado.' };

  const quantidade = toNonNegativeInt(data.quantidade);
  const custoUnitario = data.custoUnitario ?? (data.custoTotal && quantidade > 0 ? data.custoTotal / quantidade : null);
  const custoTotalEntrada = data.custoTotal ?? null;
  const controlaEstoque = produtoControlaEstoquePorVariacao(produto);
  const estoqueAtualProduto = mapearProdutoComEstoqueCalculado(produto).estoque;

  let variacaoSelecionada = null as any;
  let estoqueAtualVariacao = 0;
  let novoEstoqueVariacao = 0;
  let novoEstoqueProduto = estoqueAtualProduto;

  if (controlaEstoque) {
    variacaoSelecionada = encontrarVariacaoPorNome(produto, data.variacaoNome);
    if (!variacaoSelecionada) {
      throw {
        status: 400,
        message: `Informe o sabor para movimentar o produto "${produto.nome}".`,
      };
    }

    estoqueAtualVariacao = toNonNegativeInt(variacaoSelecionada.estoque);
    novoEstoqueVariacao = estoqueAtualVariacao;
    if (data.tipo === 'ENTRADA') novoEstoqueVariacao += quantidade;
    else if (data.tipo === 'SAIDA') {
      if (estoqueAtualVariacao < quantidade) {
        throw {
          status: 400,
          message: `Estoque insuficiente para o sabor "${variacaoSelecionada.nome}" de "${produto.nome}".`,
        };
      }
      novoEstoqueVariacao -= quantidade;
    } else if (data.tipo === 'AJUSTE') {
      novoEstoqueVariacao = quantidade;
    }

    novoEstoqueProduto = estoqueAtualProduto - estoqueAtualVariacao + novoEstoqueVariacao;
  } else {
    if (data.tipo === 'ENTRADA') novoEstoqueProduto += quantidade;
    else if (data.tipo === 'SAIDA') {
      if (produto.estoque < quantidade) throw { status: 400, message: 'Estoque insuficiente.' };
      novoEstoqueProduto -= quantidade;
    } else if (data.tipo === 'AJUSTE') {
      novoEstoqueProduto = quantidade;
    }
  }

  let novoCustoMedio = produto.custoMedio;
  let custoTotal = custoTotalEntrada;
  if (data.tipo === 'ENTRADA' && custoUnitario !== null) {
    custoTotal = custoTotal ?? custoUnitario * quantidade;
    const custoAtual = produto.custoMedio * estoqueAtualProduto;
    const novoCustoBase = custoAtual + custoTotal;
    novoCustoMedio = novoEstoqueProduto > 0 ? novoCustoBase / novoEstoqueProduto : custoUnitario;
  }

  const movimentacao = await prisma.$transaction(async (tx) => {
    if (controlaEstoque && variacaoSelecionada?.id) {
      await tx.produtoVariacao.update({
        where: { id: variacaoSelecionada.id },
        data: { estoque: novoEstoqueVariacao },
      });
    }

    await tx.produto.update({
      where: { id: data.produtoId },
      data: {
        estoque: novoEstoqueProduto,
        custoMedio: data.tipo === 'ENTRADA' && custoUnitario !== null ? novoCustoMedio : produto.custoMedio,
        custoUltimaCompra: data.tipo === 'ENTRADA' && custoUnitario !== null ? custoUnitario : produto.custoUltimaCompra,
      },
    });

    return tx.movimentacaoEstoque.create({
      data: {
        produtoId: data.produtoId,
        variacaoNome: variacaoSelecionada?.nome || data.variacaoNome?.trim() || undefined,
        tipo: data.tipo,
        quantidade,
        custoUnitario: custoUnitario ?? undefined,
        custoTotal: custoTotal ?? undefined,
        motivo: data.motivo?.trim() || undefined,
      },
    });
  });

  if (data.tipo === 'ENTRADA' && custoTotal !== null) {
    await prisma.lancamentoFinanceiro.create({
      data: {
        tipo: 'CUSTO',
        categoria: 'Estoque',
        descricao: `Compra de estoque - ${produto.nome}`,
        valor: custoTotal,
        data: new Date(),
      },
    });
  }

  return movimentacao;
}

export async function listarMovimentacoes(produtoId?: string, tipo?: string) {
  return prisma.movimentacaoEstoque.findMany({
    where: {
      ...(produtoId ? { produtoId } : {}),
      ...(tipo ? { tipo } : {}),
    },
    include: { produto: { select: { id: true, nome: true, categoria: true } } },
    orderBy: { criadoEm: 'desc' },
    take: 100,
  });
}

export async function listarCategorias() {
  const [categoriasCriadas, produtos] = await Promise.all([
    prisma.categoriaEstoque.findMany({ orderBy: { nome: 'asc' } }),
    prisma.produto.findMany({
      select: { categoria: true },
      distinct: ['categoria'],
      orderBy: { categoria: 'asc' },
    }),
  ]);

  const fromProdutos = produtos.map((r) => r.categoria).filter(Boolean);
  const merged = new Set([...categoriasCriadas.map((c) => c.nome), ...fromProdutos]);
  return Array.from(merged).sort((a, b) => a.localeCompare(b));
}

export async function listarCategoriasDetalhes() {
  const [categoriasCriadas, produtos] = await Promise.all([
    prisma.categoriaEstoque.findMany({ orderBy: { nome: 'asc' } }),
    prisma.produto.findMany({
      select: { categoria: true },
      distinct: ['categoria'],
      orderBy: { categoria: 'asc' },
    }),
  ]);

  const map = new Map(
    categoriasCriadas.map((categoria) => [
      categoria.nome,
      {
        id: categoria.id,
        nome: categoria.nome,
        acrescimoCartao: categoria.acrescimoCartao ?? 0,
        imagemUrl: categoria.imagemUrl ?? null,
      },
    ]),
  );

  for (const item of produtos) {
    if (!item.categoria || map.has(item.categoria)) continue;
    map.set(item.categoria, { id: null, nome: item.categoria, acrescimoCartao: 0, imagemUrl: null });
  }

  return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function criarCategoria(nome: string, acrescimoCartao = 0, imagemUrl?: string | null) {
  const nomeLimpo = nome.trim();
  if (!nomeLimpo) throw { status: 400, message: 'Nome da categoria e obrigatorio.' };

  const existente = await prisma.categoriaEstoque.findUnique({ where: { nome: nomeLimpo } });
  if (existente) throw { status: 409, message: 'Categoria ja cadastrada.' };

  return prisma.categoriaEstoque.create({
    data: { nome: nomeLimpo, acrescimoCartao, imagemUrl: imagemUrl?.trim() || null },
  });
}

export async function atualizarCategoria(
  id: string,
  data: { nome?: string; acrescimoCartao?: number; imagemUrl?: string | null },
) {
  const categoria = await prisma.categoriaEstoque.findUnique({ where: { id } });
  if (!categoria) throw { status: 404, message: 'Categoria nao encontrada.' };

  const nomeLimpo = data.nome?.trim();
  if (nomeLimpo && nomeLimpo !== categoria.nome) {
    const existente = await prisma.categoriaEstoque.findUnique({ where: { nome: nomeLimpo } });
    if (existente && existente.id !== id) throw { status: 409, message: 'Ja existe uma categoria com esse nome.' };
  }

  const categoriaAtualizada = await prisma.categoriaEstoque.update({
    where: { id },
    data: {
      nome: nomeLimpo || undefined,
      acrescimoCartao: data.acrescimoCartao,
      // undefined = nao mexe; string vazia -> null (remove a capa).
      imagemUrl: data.imagemUrl === undefined ? undefined : (data.imagemUrl?.trim() || null),
    },
  });

  if (nomeLimpo && nomeLimpo !== categoria.nome) {
    await prisma.produto.updateMany({
      where: { categoria: categoria.nome },
      data: { categoria: nomeLimpo },
    });
  }

  return categoriaAtualizada;
}

export async function excluirCategoria(id: string) {
  const categoria = await prisma.categoriaEstoque.findUnique({ where: { id } });
  if (!categoria) throw { status: 404, message: 'Categoria nao encontrada.' };

  const produtosDaCategoria = await prisma.produto.findMany({
    where: { categoria: categoria.nome },
    select: { id: true },
  });

  await excluirDadosRelacionadosAProdutos(produtosDaCategoria.map((produto) => produto.id));

  await prisma.categoriaEstoque.delete({ where: { id } });
}
