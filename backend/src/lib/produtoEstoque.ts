type VariacaoComEstoque = {
  nome?: string | null;
  descricao?: string | null;
  ordem?: number | null;
  estoque?: number | null;
  estoqueMinimo?: number | null;
};

type ProdutoComEstoque = {
  estoque?: number | null;
  estoqueMinimo?: number | null;
  disponivel?: boolean | null;
  controlaEstoque?: boolean | null;
  controlaEstoquePorVariacao?: boolean | null;
  variacoes?: VariacaoComEstoque[] | null;
};

function toInt(value: unknown) {
  const numero = Number(value ?? 0);
  if (!Number.isFinite(numero)) return 0;
  return Math.max(0, Math.trunc(numero));
}

export function normalizarTextoEstoque(texto?: string | null) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function produtoControlaEstoquePorVariacao(produto?: ProdutoComEstoque | null) {
  return Boolean(produto?.controlaEstoquePorVariacao);
}

/**
 * A casa e marmitaria: quase tudo e feito na hora e vive com saldo zero de
 * proposito. So controla estoque quem foi marcado para isso.
 *
 * O padrao proposital e "nao controla": se a consulta esquecer de pedir o
 * campo, o item segue vendendo. O contrario deixava o cardapio inteiro
 * esgotado sem ninguem entender o porque.
 */
export function produtoControlaEstoque(produto?: ProdutoComEstoque | null) {
  return produto?.controlaEstoque === true;
}

/**
 * Regra unica de "da para vender agora". Toda tela, tool da IA e venda no
 * balcao passa por aqui, senao cada lugar reinventa a conta e discorda.
 */
export function produtoDisponivelParaVenda(produto?: ProdutoComEstoque | null) {
  if (!produto || produto.disponivel === false) return false;
  if (!produtoControlaEstoque(produto)) return true;
  return toInt(produto.estoque) > 0;
}

export function normalizarVariacoesComEstoque<T extends VariacaoComEstoque>(variacoes?: T[] | null) {
  if (!Array.isArray(variacoes)) return [];

  return variacoes.map((variacao) => ({
    ...variacao,
    estoque: toInt(variacao?.estoque),
    estoqueMinimo: toInt(variacao?.estoqueMinimo),
  }));
}

export function calcularEstoqueTotalVariacoes(variacoes?: VariacaoComEstoque[] | null) {
  return normalizarVariacoesComEstoque(variacoes).reduce((total, variacao) => total + toInt(variacao.estoque), 0);
}

export function encontrarVariacaoPorNome<T extends VariacaoComEstoque>(
  produto: { variacoes?: T[] | null },
  nome?: string | null,
) {
  const nomeNormalizado = normalizarTextoEstoque(nome);
  if (!nomeNormalizado) return null;

  return normalizarVariacoesComEstoque(produto?.variacoes as T[]).find(
    (variacao) => normalizarTextoEstoque(variacao?.nome) === nomeNormalizado,
  ) || null;
}

export function mapearProdutoComEstoqueCalculado<T extends ProdutoComEstoque>(
  produto: T,
  options?: { ocultarVariacoesSemEstoque?: boolean; recalcularDisponibilidade?: boolean },
) {
  const variacoesNormalizadas = normalizarVariacoesComEstoque(produto?.variacoes);
  const estoqueCalculado = produtoControlaEstoquePorVariacao(produto)
    ? calcularEstoqueTotalVariacoes(variacoesNormalizadas)
    : toInt(produto?.estoque);
  const variacoes = options?.ocultarVariacoesSemEstoque && produtoControlaEstoquePorVariacao(produto)
    ? variacoesNormalizadas.filter((variacao) => toInt(variacao.estoque) > 0)
    : variacoesNormalizadas;

  return {
    ...produto,
    estoque: estoqueCalculado,
    // Prato feito na hora tem estoque zero de proposito. Cobrar saldo dele aqui
    // marcava o cardapio inteiro como esgotado: a casa cadastrou tudo sem
    // quantidade, como e o certo, e nada aparecia para vender.
    disponivel: options?.recalcularDisponibilidade
      ? produtoDisponivelParaVenda({ ...produto, estoque: estoqueCalculado })
      : produto?.disponivel,
    variacoes,
  };
}
