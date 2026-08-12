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
    disponivel: options?.recalcularDisponibilidade
      ? Boolean(produto?.disponivel !== false && estoqueCalculado > 0)
      : produto?.disponivel,
    variacoes,
  };
}
