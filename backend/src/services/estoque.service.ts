import { prisma } from '../lib/prisma';
import { normalizeImageUrl } from '../lib/url';
import {
  calcularEstoqueTotalVariacoes,
  encontrarVariacaoPorNome,
  mapearProdutoComEstoqueCalculado,
  normalizarTextoEstoque,
  produtoControlaEstoquePorVariacao,
} from '../lib/produtoEstoque';

type ProdutoVariacaoInput = {
  nome: string;
  descricao?: string;
  estoque?: number;
  estoqueMinimo?: number;
};

type ProdutoEntradaPodSabor = {
  nome: string;
  estoque: number;
};

type ProdutoEntradaPod = {
  nome: string;
  precoPix: number;
  sabores: ProdutoEntradaPodSabor[];
};

const RAW_LISTA_PODS = `
IGNITE V15
$15 Pix ou Dinheiro
$20 Cartao
Blue Razz Ice. 11un
Cucumber Ice 60un

IGNITE V80 NEW
$95 Pix ou Dinheiro
$100 Cartao
Passion Fruit Sour Kiwi. 2un
Green Apple. 1un
Strawberry Kiwi. 4un
Banana Cherry. 1un
Watermelon Ice. 3un
Strawberry Ice. 1un
Acai Ice. 1un
Frozen Mint Water. 2un

REFIL IGNITE 10K
$70 Pix ou Dinheiro
$75 Cartao
Blueberry Ice. 2un

IGNITE V150
$70 Pix ou Dinheiro
$75 Cartao
Watermelon Dragon Fruit. 4un

IGNITE V155
$90 Pix ou Dinheiro
$95 Cartao
Strawberry Watermelon Ice. 10un
Watermelon Ice. 1un
Tropical Acai. 5un
Strawberry Kiwi. 15un
Kiwi Passion Fruit Guava. 4un
Strawberry Ice. 1un
Watermelon Dragon Fruit. 9un

IGNITE V250
$110 Pix ou Dinheiro
$115 Cartao
Sweet and Sour Pomegranate. 4un
Strawberry Ice. 7un
Cactus Lime Soda. 1un
Grape Ice. 10un
Minty Melon. 2un
Watermelon Ice. 2un
Strawberry Kiwi. 9un
Watermelon Mix. 7un
Icy Mint. 10un
Pineapple Ice. 5un

IGNITE V300
$120 Pix ou Dinheiro
$125 Cartao
Strawberry Ice. 5un
Green Apple. 2un
Watermelon Ice. 3un

IGNITE V300 SLIM
$120 Pix ou Dinheiro
$125 Cartao
Watermelon Mix. 3un
Strawberry Banana. 10un
Cactus Lime Soda. 10un
Strawberry Ice. 10un
Icy Mint. 10un
Grape Ice. 5un
Aloe Grape Ice. 10un
Green Apple. 10un
Menthol. 10un

IGNITE V400 ICE
$110 Pix ou Dinheiro
$115 Cartao
Peach. 5un
Grape Peach. 5un
Grape Mix. 4un
Strawberry Banana. 4un
Strawberry Watermelon. 5un
Passion Fruit Sour Kiwi. 1un
Cherry Watermelon. 5un
Strawberry Kiwi. 5un
Pineapple Kiwi Dragon Fruit. 4un
Sakura Grape. 5un
Grape. 5un

IGNITE V400 MIX
$120 Pix ou Dinheiro
$125 Cartao
Banana Ice / Strawberry Ice. 10un
Orange Ice / Strawberry Ice. 10un
Blueberry Ice / Raspberry Blackberry. 10un
Minty Melon / Menthol. 15un
Mango Ice / Passion Fruit Guava. 10un
Icy Mint / Peach Grape. 12un
Grape Ice / Strawberry. 9un
Strawberry Watermelon Ice / Aloe Grape. 10un
Watermelon Ice / Cherry Ice. 10un
Pineapple Mango Ice / Strawberry Ice. 10un
Strawberry Mango Ice / Banana Ice. 10un
Grape Pop / Peach Ice. 10un

ELF 4K E 5K
$40 Pix ou Dinheiro
$45 Cartao
Mint Tobacco. 19un
Orange Pear Nectar. 1un
Passion Fruit Orange Guava. 3un

ELFBAR 9K KIT
$100 Pix ou Dinheiro
$105 Cartao
Blue Razz Ice. 14un

ELF BC 10K
$80 Pix ou Dinheiro
$85 Cartao
Strawberry Banana. 5un
Miami Mint. 9un
Blackberry Cranberry. 7un

ELF BC 15K
$85 Pix ou Dinheiro
$90 Cartao
Tropical Lemonade. 4un
Pear Watermelon Dragonfruit. 7un
Bubbaloo Grape. 1un
Strawberry Ice Cream. 9un
Strawberry Ice. 8un
Watermelon Ice. 4un

ELF GH 23K
$110 Pix ou Dinheiro
$115 Cartao
Peach Mango Watermelon. 8un
Watermelon Ice. 10un
Strawberry Ice. 10un
Baja Splash. 3un
Blue Razz Ice. 10un
Miami Mint. 10un

ELF TE 30K
$90 Pix ou Dinheiro
$95 Cartao
Strawberry Watermelon Ice. 10un
Guava Passion Fruit Kiwi. 10un
Pineapple Ice. 9un
Winter Mint. 4un
Dragon Strawnana. 3un
Acai Banana Ice. 13un
Cherry Strazz. 10un
Blueberry Ice. 10un
Strawberry Ice. 10un
Miami Mint. 9un
Watermelon Ice. 10un
Strawmelon Peach. 10un
Bubbaloo Grape. 20un
Peach Mango Watermelon. 10un
Bubbaloo Tutti Frutti. 10un

ELF TRIO 40K
$110 Pix ou Dinheiro
$115 Cartao
Blueberry Pom Slushy. 10un
Black Mint. 10un
Pomegranate Blast. 5un
Sour Apple Ice. 10un
Scary Berry. 10un
Cool Menthol. 10un

ELF ICE KING 40K
$90 Pix ou Dinheiro
$95 Cartao
Peach+. 40un
Mango Magic. 18un
Miami Mint. 43un
Watermelon Ice. 30un
Sour Strawberry Dragonfruit. 29un
Summer Splash. 28un
Cherry Fuse. 13un
Cherry Strazz. 18un
Tigers Blood. 20un
Blue Razz Ice. 28un
Sour Lush Gummy. 4un
Dragon Strawnana. 20un
Scary Berry. 35un
Baja Splash. 26un
Sour Apple Ice. 23un

ELF ICE KING SUMMER 40K
$130 Pix ou Dinheiro
$135 Cartao
Wild Berry Slush. 3un
Green Apple Slush. 3un

ELF 45K
$120 Pix ou Dinheiro
$125 Cartao
Blueberry Strawberry Coconut Ice. 10un
Miami Mint. 10un
Watermelon Ice. 10un
Strawberry Kiwi. 9un
Strawberry Ice. 10un
Grape Twist. 10un
Pineapple POM. 10un
Watermelon Peach Frost. 9un

NIK BAR 10K
$75 Pix ou Dinheiro
$80 Cartao
Sakura Grape. 8un
Passion Sour Kiwi. 7un
Miami Mint. 2un
Strawberry Kiwi. 3un
Grape Apple Ice. 4un
Pineapple Ice. 5un
Strawberry Banana. 2un
Strawberry Shortcake. 4un
Grape Ice. 2un

NIKBAR 30K
$85 Pix ou Dinheiro
$90 Cartao
Strawberry Kiwi. 10un
Icy Mint. 10un
Miami Mint. 10un
Strawberry Ice. 10un
Strawberry Apple Watermelon. 10un
Grape Ice. 10un
Passion Fruit Sour Kiwi. 10un
Watermelon Cherry. 3un
Sakura Grape. 10un
Watermelon Ice. 2un

NIK BAR 40K
$110 Pix ou Dinheiro
$115 Cartao
Strawberry Watermelon. 6un
Bergamot Lime Mint. 7un
Miami Mint. 4un
Ice Mint. 1un

LOST MARY 10K
$80 Pix ou Dinheiro
$85 Cartao
Apple Coconut. 6un
Strawberry Smoothie. 2un
Forest Berry Energy. 6un

LOST MARY 15K
$70 Pix ou Dinheiro
$75 Cartao
Strawberry Watermelon Ice. 24un
Watermelon Ice. 30un
Miami Mint. 22un
Strawberry Banana. 3un
Guava Passion Fruit Kiwi. 29un
Green Apple. 17un
Kiwi Watermelon Apple. 31un
Peach Mango Watermelon. 29un
Banana Ice. 22un
Strawberry Kiwi. 27un
Sakura Grape. 23un
Strawberry Ice. 27un
Grape Ice. 34un

LOST MARY 35K DURA
$100 Pix ou Dinheiro
$105 Cartao
Menthol. 1un
Blue Razz Ice. 1un

OXBAR 30K
$100 Pix ou Dinheiro
$115 Cartao
Blue Raspberry Lemon. 3un
Strawberry Watermelon Dragonfruit. 9un
Blackcurrant Lemon Ice. 1un

OXBAR 50K
$140 Pix ou Dinheiro
$145 Cartao
Strawberry Kiwi. 2un
Watermelon Ice. 3un
Pineapple Ice. 9un
Strawberry Ice. 7un
Menthol. 5un
Icy Mint. 4un
Grape Ice. 4un
Pineapple Kiwi Dragonfruit. 3un
Strawberry Grape. 3un

VAPE GIN 8K
$45 Pix ou Dinheiro
$50 Cartao
Mango Peach Apricot Ice. 4un

VAPE SOUL 12K
$65 Pix ou Dinheiro
$70 Cartao
Mint Menthol. 27un
Watermelon Ice. 23un
Strawberry Kiwi. 1un
Strawberry Banana. 30un
Double Apple. 29un

ADJUST 40K
$90 Pix ou Dinheiro
$95 Cartao
Midnight Ice Chill. 3un
Tangerine White Gummy. 6un

SEXADDCIT 28K
$110 Pix ou Dinheiro
$115 Cartao
Icy Mint. 3un
Kiwi Watermelon Ice. 5un
Strawberry Banana Ice. 4un
Strawberry Ice. 3un
Strawberry Watermelon Ice. 2un
Menthol. 3un

FUNKY 7K
$40 Pix ou Dinheiro
$45 Cartao
Mixed Fruit. 53un
Rainbow Cloudz. 28un

RABBEATS 50K
$95 Pix ou Dinheiro
$100 Cartao
Sakura Grape. 4un
Menthol. 18un
Sour Watermelon Peach. 15un
Strawberry Ice. 13un
Green Apple Ice. 15un
Triple Berry. 12un
Blueberry Lemon. 19un
Fanta Strawberry. 6un
Banana Ice. 23un
Kiwi Passion Fruit Guava. 2un
Strawberry Kiwi Ice. 7un
Miami Mint. 11un
Watermelon Ice. 10un
Pineapple Ice. 4un
Icy Mint. 10un

WAKA 70K
$120 Pix ou Dinheiro
$125 Cartao
Strawberry. 10un
Peach Blueberry Raspberry. 10un
Watermelon. 10un
Green Apple. 5un
Grape. 10un
Strawberry Kiwi. 10un
Passion Fruit. 9un
Cherry Bomb. 10un

BLACK SHEEP 55K
$130 Pix ou Dinheiro
$135 Cartao
Mixed Berry. 5un
Cool Mint. 5un
Strawberry Banana. 4un
Passion Fruit. 4un
Aloe Grape. 5un
Watermelon Ice. 5un
Miami Mint. 5un
Blueberry Watermelon. 5un
`;

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

function parsePrecoPix(linhaPreco: string) {
  const match = linhaPreco.match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!match) throw new Error(`Nao foi possivel ler o preco em: ${linhaPreco}`);
  return Number(match[1].replace(/\./g, '').replace(',', '.'));
}

function isPriceLine(linha: string) {
  return /^([R$&]\s*)?\$?\s*\d/.test(linha.trim());
}

function isInicioProduto(linhas: string[], idx: number) {
  return (
    idx + 1 < linhas.length &&
    !isPriceLine(linhas[idx]) &&
    isPriceLine(linhas[idx + 1])
  );
}

function parseLinhaSabor(linha: string) {
  const match = linha.match(/^(.*?)[.\s]*([0-9]+)\s*u[nm]\b/i);
  if (!match) return null;

  const nome = match[1].replace(/[.\s]+$/g, '').trim();
  const estoque = toNonNegativeInt(match[2]);
  if (!nome) return null;

  return { nome, estoque };
}

function parseListaPods(raw: string): ProdutoEntradaPod[] {
  const linhas = raw
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);

  const produtos: ProdutoEntradaPod[] = [];
  let i = 0;
  while (i < linhas.length) {
    if (!isInicioProduto(linhas, i)) {
      i += 1;
      continue;
    }

    const nome = linhas[i];
    const precoPix = parsePrecoPix(linhas[i + 1]);
    i += 1;

    while (i < linhas.length && isPriceLine(linhas[i])) {
      i += 1;
    }

    const sabores: ProdutoEntradaPodSabor[] = [];
    while (i < linhas.length && !isInicioProduto(linhas, i)) {
      const sabor = parseLinhaSabor(linhas[i]);
      if (sabor) sabores.push(sabor);
      i += 1;
    }

    produtos.push({ nome, precoPix, sabores });
  }

  const merged = new Map<string, ProdutoEntradaPod>();
  for (const produto of produtos) {
    const produtoKey = normalizarTextoEstoque(produto.nome);
    const existente = merged.get(produtoKey);
    if (!existente) {
      merged.set(produtoKey, {
        nome: produto.nome.trim(),
        precoPix: produto.precoPix,
        sabores: produto.sabores.map((sabor) => ({
          nome: sabor.nome.trim(),
          estoque: toNonNegativeInt(sabor.estoque),
        })),
      });
      continue;
    }

    const saboresMap = new Map<string, ProdutoEntradaPodSabor>();
    for (const sabor of [...existente.sabores, ...produto.sabores]) {
      const key = normalizarTextoEstoque(sabor.nome);
      const atual = saboresMap.get(key);
      if (!atual) {
        saboresMap.set(key, { nome: sabor.nome.trim(), estoque: toNonNegativeInt(sabor.estoque) });
        continue;
      }

      saboresMap.set(key, {
        nome: atual.nome,
        estoque: atual.estoque + toNonNegativeInt(sabor.estoque),
      });
    }

    merged.set(produtoKey, {
      nome: existente.nome,
      precoPix: produto.precoPix || existente.precoPix,
      sabores: Array.from(saboresMap.values()),
    });
  }

  return Array.from(merged.values())
    .map((produto) => ({
      ...produto,
      sabores: produto.sabores.sort((a, b) => a.nome.localeCompare(b.nome)),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
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

export async function importarPodsCategoria() {
  const produtos = parseListaPods(RAW_LISTA_PODS);

  const categoriaPod = await prisma.categoriaEstoque.upsert({
    where: { nome: 'Pod' },
    update: {},
    create: { nome: 'Pod', acrescimoCartao: 5 },
  });

  let criados = 0;
  let atualizados = 0;

  for (const produto of produtos) {
    const variacoes = produto.sabores.map((sabor, ordem) => ({
      nome: sabor.nome,
      descricao: null as string | null,
      ordem,
      estoque: toNonNegativeInt(sabor.estoque),
      estoqueMinimo: 1,
    }));

    const estoqueTotal = calcularEstoqueTotalVariacoes(variacoes);
    const existente = await prisma.produto.findFirst({
      where: { nome: produto.nome, categoria: 'Pod' },
      select: { id: true },
    });

    if (existente) {
      await prisma.produto.update({
        where: { id: existente.id },
        data: {
          descricao: null,
          categoria: 'Pod',
          tipoVariacao: 'Sabor',
          controlaEstoquePorVariacao: true,
          preco: produto.precoPix,
          custoMedio: 0,
          custoUltimaCompra: 0,
          estoque: estoqueTotal,
          estoqueMinimo: 1,
          disponivel: true,
          variacoes: {
            deleteMany: {},
            create: variacoes,
          },
        },
      });
      atualizados += 1;
    } else {
      await prisma.produto.create({
        data: {
          nome: produto.nome,
          descricao: null,
          categoria: 'Pod',
          tipoVariacao: 'Sabor',
          controlaEstoquePorVariacao: true,
          preco: produto.precoPix,
          custoMedio: 0,
          custoUltimaCompra: 0,
          estoque: estoqueTotal,
          estoqueMinimo: 1,
          disponivel: true,
          variacoes: {
            create: variacoes,
          },
        },
      });
      criados += 1;
    }
  }

  return {
    categoriaId: categoriaPod.id,
    processados: produtos.length,
    criados,
    atualizados,
  };
}
