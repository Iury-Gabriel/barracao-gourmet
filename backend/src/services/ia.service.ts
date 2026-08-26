import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { config } from '../config/env';
import { normalizeImageUrl } from '../lib/url';
import {
  encontrarVariacaoPorNome,
  mapearProdutoComEstoqueCalculado,
  produtoControlaEstoquePorVariacao,
} from '../lib/produtoEstoque';
import { buscarEnderecoPorCep, buscarPedidoCardapio, calcularFreteCardapio, criarPedidoCardapio } from './cardapio.service';
import { criarReserva } from './reservas.service';
import { gerarQrCodePix, isMercadoPagoConfigured } from './mercado-pago.service';

// Dominio proprio ainda nao registrado; por enquanto o cardapio publico vive no sslip.io.
const ATENDIMENTO_CARDAPIO_URL =
  process.env.CARDAPIO_PUBLIC_URL || 'https://barracao.86-48-19-98.sslip.io/cardapio';
const ATENDIMENTO_AVISO_HORARIO_ENTREGA =
  'As entregas comecam a partir das 11h00, em ordem de pedido. Se o pedido for feito antes desse horario, ele sai para entrega a partir das 11h00; depois disso, o prazo medio e de 30 minutos.';
const STOPWORDS_BUSCA = new Set([
  'o', 'a', 'os', 'as', 'de', 'da', 'do', 'das', 'dos', 'pra', 'para', 'tem', 'ter', 'quero', 'queria',
  'me', 'mostrar', 'mostra', 'quais', 'qual', 'com', 'sem', 'um', 'uma', 'uns', 'umas', 'por', 'favor',
  'ai', 'aqui', 'isso', 'esse', 'essa', 'esses', 'essas', 'que', 'lista', 'catalogo', 'cardapio',
  'disponivel', 'disponiveis', 'preco', 'valor', 'quanto', 'custa', 'hoje', 'completa', 'completo',
  'manda', 'mandar', 'envia', 'enviar', 'passa', 'passar', 'todas', 'todos', 'opcao', 'opcoes',
]);

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function normalizarBuscaTexto(texto: string) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function mensagemPedeCatalogoOuDisponibilidade(mensagem: string) {
  const texto = normalizarBuscaTexto(mensagem);
  if (!texto) return false;

  return /(^tem\s+[a-z0-9]|o que tem|quais.*tem|quais sao|tem pra|tem de|tem ai|mostra|lista|catalogo|cardapio|disponivel|disponiveis|estoque|preco de|valor de|quanto custa|quanto ta)/i.test(texto);
}

function mensagemPedeLinkCardapio(mensagem: string) {
  const texto = normalizarBuscaTexto(mensagem);
  if (!texto) return false;

  if (texto === 'cardapio' || texto === 'catalogo') return true;

  return /(link|url|site|abrir|abre|manda|enviar|envia|passa).*(cardapio|catalogo|menu)|(cardapio|catalogo|menu).*(link|url|site|abrir|abre|manda|enviar|envia|passa)/i.test(texto);
}

function responderLinkCardapio() {
  return `Claro! Aqui esta o link do cardapio:\n${ATENDIMENTO_CARDAPIO_URL}\n\nSe preferir, continuo seu pedido por aqui agora.`;
}

// Textos oficiais. Devem ser enviados exatamente assim, sem reescrita da IA.
export const ATENDIMENTO_BOAS_VINDAS = `Olá, tudo bem? Aqui é a Linda, do Barracão 🙂

Nosso cardápio do dia está no site, é só escolher, colocar no carrinho e finalizar:
${ATENDIMENTO_CARDAPIO_URL}

Atendemos de segunda a sábado, das 10h às 15h, e as entregas começam às 11h, em ordem de pedido.

Qual vai ser o seu pedido?`;

const ATENDIMENTO_OFERTA_PEDIDO_MANUAL = 'Prefere que eu anote seu pedido por aqui mesmo?';

const ATENDIMENTO_FORMULARIO_PEDIDO_MANUAL = `Pode copiar e completar aqui que eu já anoto 🙂

Seu nome:
Telefone:
Entrega ou retirada:
CEP e número (se for entrega):
Itens do pedido:
Forma de pagamento:`;

// Rotulos do formulario oficial. Se a mensagem traz esses campos, o cliente esta DEVOLVENDO
// o formulario preenchido - nunca pedindo um novo. Sem isso o bot reenvia o formulario em
// branco para sempre, porque o proprio texto devolvido casa nos termos de "pedido manual".
const CAMPOS_FORMULARIO_PEDIDO_MANUAL = [
  'seu nome',
  'entrega ou retirada',
  'cep e numero',
  'itens do pedido',
  'forma de pagamento',
];

function mensagemEhFormularioDevolvido(textoNormalizado: string) {
  const campos = CAMPOS_FORMULARIO_PEDIDO_MANUAL.filter((campo) => textoNormalizado.includes(campo));
  return campos.length >= 2;
}

function mensagemPedePedidoManual(mensagem: string) {
  const texto = normalizarBuscaTexto(mensagem);
  if (!texto) return false;
  if (mensagemEhFormularioDevolvido(texto)) return false;

  return /(pedido|pedir|comprar|montar)[^.!?]{0,20}(manual|manualmente|por aqui|por aq|pelo whats|por whats)|(manual|manualmente)[^.!?]{0,20}(pedido|pedir)/i.test(
    texto
  );
}

// Aceite puro da oferta: a mensagem INTEIRA precisa ser afirmativa.
// Ancorar so o inicio deixaria "quero 2 porcoes de calabresa" virar "sim" e devolver formulario em branco.
const NUCLEO_AFIRMATIVO =
  '(s|sim|isso|claro|quero|queria|aceito|bora|vamos|vamo|ok|okay|blz|beleza|pode|pode ser|manda|manda ai|pode mandar|pode sim|sim quero|quero sim|por favor|pf|uhum|aham|positivo|certo|show|perfeito|fechado|top)';
const REGEX_AFIRMATIVA = new RegExp(`^${NUCLEO_AFIRMATIVO}([ ,]+${NUCLEO_AFIRMATIVO})*$`);

function mensagemEhAfirmativa(mensagem: string) {
  const texto = normalizarBuscaTexto(mensagem)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!texto) return false;
  if (/\b(nao|nunca|depois|agora nao)\b/.test(texto)) return false;
  // Limita o backtracking do regex e descarta frases longas, que nunca sao aceite puro.
  if (texto.split(' ').length > 6) return false;

  return REGEX_AFIRMATIVA.test(texto);
}

/**
 * Reserva o direito de enviar a saudacao para este contato.
 * Retorna true UMA unica vez por conversa: o updateMany condicional so afeta linha
 * quando saudacaoEnviadaEm ainda e null, entao webhook duplicado, retry do debounce
 * ou execucao concorrente nao geram boas-vindas repetida.
 */
async function reivindicarSaudacao(instanciaId: string, remetente: string) {
  try {
    await prisma.atendimentoIa.upsert({
      where: { instanciaId_remetente: { instanciaId, remetente } },
      create: { instanciaId, remetente, saudacaoEnviadaEm: null },
      update: {},
    });
  } catch (err) {
    // Corrida na criacao (unique violation): a linha passou a existir, o updateMany abaixo resolve.
    console.warn('[ia] upsert de atendimento falhou, seguindo para o claim', err);
  }

  try {
    const resultado = await prisma.atendimentoIa.updateMany({
      where: { instanciaId, remetente, saudacaoEnviadaEm: null },
      data: { saudacaoEnviadaEm: new Date() },
    });
    return resultado.count === 1;
  } catch (err) {
    // Nunca derrubar o atendimento por causa da saudacao: na duvida, nao sauda.
    console.error('[ia] falha ao reivindicar saudacao', err);
    return false;
  }
}

// Oferta armada por no maximo 30 min: um "ok" solto horas depois nao deve devolver formulario.
const JANELA_OFERTA_PEDIDO_MANUAL_MS = 30 * 60 * 1000;

/**
 * Devolve o direito de saudar. Usado quando o envio da saudacao falha no WhatsApp:
 * sem isso o claim ja consumido faria o cliente novo nunca receber as boas-vindas.
 */
export async function liberarSaudacao(instanciaId: string, remetente: string) {
  try {
    await prisma.atendimentoIa.updateMany({
      where: { instanciaId, remetente },
      data: { saudacaoEnviadaEm: null },
    });
  } catch (err) {
    console.error('[ia] falha ao liberar saudacao', err);
  }
}

// A oferta de pedido manual so vale como "sim" se a ultima coisa que a IA falou foi justamente a oferta.
async function clienteAceitouOfertaPedidoManual(mensagem: string, instanciaId: string, remetente: string) {
  if (!mensagemEhAfirmativa(mensagem)) return false;

  const ultima = await prisma.mensagemIA.findFirst({
    // resposta: { not: null } pula mensagem manual do painel e registro de IA pausada,
    // que entrariam na frente e esconderiam a oferta.
    where: { instanciaId, remetente, resposta: { not: null } },
    orderBy: { criadoEm: 'desc' },
    select: { resposta: true, criadoEm: true },
  });

  const resposta = ultima?.resposta || '';
  if (!resposta.includes(ATENDIMENTO_OFERTA_PEDIDO_MANUAL)) return false;
  // Se o formulario ja foi junto naquela resposta, a oferta nao esta mais pendente.
  if (resposta.includes(ATENDIMENTO_FORMULARIO_PEDIDO_MANUAL)) return false;

  const idadeMs = Date.now() - new Date(ultima!.criadoEm).getTime();
  return idadeMs <= JANELA_OFERTA_PEDIDO_MANUAL_MS;
}

function singularizarToken(token: string) {
  const valor = String(token || '').trim();
  if (!valor) return '';
  if (valor.endsWith('oes')) return valor.slice(0, -2);
  if (valor.endsWith('es') && valor.length > 4) return valor.slice(0, -2);
  if (valor.endsWith('s') && valor.length > 3) return valor.slice(0, -1);
  return valor;
}

function extrairTokensBuscaCatalogo(texto: string) {
  const tokensBase = String(texto || '')
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 2 && !STOPWORDS_BUSCA.has(token));

  const tokensExpandido = new Set<string>();
  for (const token of tokensBase) {
    tokensExpandido.add(token);
    const singular = singularizarToken(token);
    if (singular) tokensExpandido.add(singular);
  }

  return Array.from(tokensExpandido);
}

type ProdutoBuscaAtendimento = {
  id?: string;
  nome?: string;
  categoria?: string;
  descricao?: string;
  tipoVariacao?: string | null;
  controlaEstoquePorVariacao?: boolean;
  preco?: number;
  estoque?: number;
  disponivel?: boolean;
  imagemUrl?: string | null;
  variacoes?: Array<{ nome?: string; descricao?: string; estoque?: number; estoqueMinimo?: number }>;
};

function extrairPalavrasNormalizadas(texto: string) {
  return normalizarBuscaTexto(texto)
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

function distanciaEdicaoLimitada(a: string, b: string, limite = 1) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limite) return limite + 1;

  const linhas = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j += 1) {
    let diagonal = linhas[0];
    linhas[0] = j;
    let menorLinha = linhas[0];

    for (let i = 1; i <= a.length; i += 1) {
      const atual = linhas[i];
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      linhas[i] = Math.min(
        linhas[i] + 1,
        linhas[i - 1] + 1,
        diagonal + custo,
      );
      diagonal = atual;
      if (linhas[i] < menorLinha) menorLinha = linhas[i];
    }

    if (menorLinha > limite) return limite + 1;
  }

  return linhas[a.length];
}

function palavraCombinaToken(palavra: string, token: string) {
  const palavraNormalizada = normalizarBuscaTexto(palavra);
  const tokenNormalizado = normalizarBuscaTexto(token);

  if (!palavraNormalizada || !tokenNormalizado) return false;
  if (palavraNormalizada.includes(tokenNormalizado) || tokenNormalizado.includes(palavraNormalizada)) {
    return true;
  }

  if (palavraNormalizada.length < 5 || tokenNormalizado.length < 5) return false;
  return distanciaEdicaoLimitada(palavraNormalizada, tokenNormalizado, 1) <= 1;
}

function calcularRelevanciaProdutoBusca(
  produto: ProdutoBuscaAtendimento,
  textoNormalizado: string,
  tokens: string[],
) {
  const nomeNormalizado = normalizarBuscaTexto(produto.nome || '');
  const categoriaNormalizada = normalizarBuscaTexto(produto.categoria || '');
  const descricaoNormalizada = normalizarBuscaTexto(produto.descricao || '');
  const variacoesNormalizadas = Array.isArray(produto.variacoes)
    ? produto.variacoes.map((variacao) => normalizarBuscaTexto(`${variacao?.nome || ''} ${variacao?.descricao || ''}`)).filter(Boolean)
    : [];

  const palavrasNome = extrairPalavrasNormalizadas(nomeNormalizado);
  const palavrasCategoria = extrairPalavrasNormalizadas(categoriaNormalizada);
  const palavrasDescricao = extrairPalavrasNormalizadas(descricaoNormalizada);
  const palavrasVariacoes = variacoesNormalizadas.flatMap((variacao) => extrairPalavrasNormalizadas(variacao));

  const fraseNome = Boolean(textoNormalizado) && nomeNormalizado.includes(textoNormalizado);
  const fraseVariacao = Boolean(textoNormalizado) && variacoesNormalizadas.some((variacao) => variacao.includes(textoNormalizado));
  const fraseCompleta = Boolean(textoNormalizado) && normalizarBuscaTexto(
    `${produto.nome || ''} ${produto.categoria || ''} ${produto.descricao || ''} ${variacoesNormalizadas.join(' ')}`,
  ).includes(textoNormalizado);

  const tokensCorrespondidos = new Set<string>();
  let relevancia = 0;

  if (fraseNome) relevancia += 120;
  if (fraseVariacao) relevancia += 90;
  if (fraseCompleta && !fraseNome && !fraseVariacao) relevancia += 60;

  for (const token of tokens) {
    if (palavrasNome.some((palavra) => palavraCombinaToken(palavra, token))) {
      relevancia += 18;
      tokensCorrespondidos.add(token);
      continue;
    }
    if (palavrasVariacoes.some((palavra) => palavraCombinaToken(palavra, token))) {
      relevancia += 14;
      tokensCorrespondidos.add(token);
      continue;
    }
    if (palavrasCategoria.some((palavra) => palavraCombinaToken(palavra, token))) {
      relevancia += 8;
      tokensCorrespondidos.add(token);
      continue;
    }
    if (palavrasDescricao.some((palavra) => palavraCombinaToken(palavra, token))) {
      relevancia += 4;
      tokensCorrespondidos.add(token);
    }
  }

  return {
    relevancia,
    tokensCorrespondidos: tokensCorrespondidos.size,
    fraseNome,
    fraseVariacao,
    produto,
  };
}

function ranquearProdutosPorBusca(produtos: ProdutoBuscaAtendimento[], textoNormalizado: string, tokens: string[]) {
  const minimoTokensCorrespondidos = tokens.length >= 4 ? 2 : tokens.length >= 2 ? 1 : 0;

  return produtos
    .map((produto) => calcularRelevanciaProdutoBusca(produto, textoNormalizado, tokens))
    .filter((item) => {
      if (!textoNormalizado) return true;
      if (item.fraseNome || item.fraseVariacao) return true;
      return item.tokensCorrespondidos >= minimoTokensCorrespondidos && item.relevancia > 0;
    })
    .sort((a, b) =>
      b.relevancia - a.relevancia ||
      b.tokensCorrespondidos - a.tokensCorrespondidos ||
      String(a.produto.nome || '').localeCompare(String(b.produto.nome || ''))
    );
}

function resolverMelhorProdutoPorNome(produtos: ProdutoBuscaAtendimento[], nomeBusca: string) {
  const textoBusca = normalizarBuscaTexto(nomeBusca);
  const tokensBusca = extrairTokensBuscaCatalogo(textoBusca);
  const ranqueados = ranquearProdutosPorBusca(produtos, textoBusca, tokensBusca);

  if (!ranqueados.length) {
    return {
      produto: null,
      opcoes: [],
    };
  }

  const [melhor, segundo] = ranqueados;
  const escolhaConfiavel =
    !segundo ||
    melhor.relevancia >= segundo.relevancia + 20 ||
    melhor.tokensCorrespondidos >= segundo.tokensCorrespondidos + 2 ||
    (melhor.fraseVariacao && !segundo.fraseVariacao) ||
    (melhor.fraseNome && !segundo.fraseNome);

  return {
    produto: escolhaConfiavel ? melhor.produto : null,
    opcoes: ranqueados.slice(0, 3).map((item) => item.produto),
  };
}

function produtoCombinaBuscaCatalogo(
  produto: { nome?: string; categoria?: string; descricao?: string; variacoes?: Array<{ nome?: string; descricao?: string }> },
  textoNormalizado: string,
  tokens: string[],
) {
  return ranquearProdutosPorBusca([produto], textoNormalizado, tokens).length > 0;
}

function obterSaboresProduto(produto: { variacoes?: Array<{ nome?: string; estoque?: number }> }) {
  return Array.isArray(produto.variacoes)
    ? produto.variacoes
        .filter((variacao) => variacao?.estoque === undefined || Number(variacao.estoque || 0) > 0)
        .map((variacao) => String(variacao?.nome || '').trim())
        .filter(Boolean)
    : [];
}

function formatarSaboresProduto(produto: { variacoes?: Array<{ nome?: string; estoque?: number }> }) {
  const sabores = obterSaboresProduto(produto);
  if (sabores.length === 0) return '';
  return sabores.join(', ');
}

function mensagemPedeSabores(textoNormalizado: string) {
  return /\bsabor(?:es)?\b/.test(textoNormalizado);
}

function produtoExigeVariacao(produto: { tipoVariacao?: string | null; variacoes?: Array<{ nome?: string; estoque?: number }> }) {
  return Boolean(String(produto.tipoVariacao || '').trim()) || obterSaboresProduto(produto).length > 0;
}

function resolverVariacaoProduto(
  produto: { variacoes?: Array<{ nome?: string; estoque?: number }> },
  variacaoInformada?: string | null,
) {
  return encontrarVariacaoPorNome(produto, variacaoInformada);
}

function clienteConfirmouFormaPagamento(texto: string, pagamento: 'PIX' | 'CARTAO_CREDITO' | 'CARTAO_DEBITO' | 'DINHEIRO') {
  const textoNormalizado = normalizarBuscaTexto(texto);
  if (!textoNormalizado) return false;

  if (pagamento === 'PIX') return /\bpix\b/.test(textoNormalizado);
  if (pagamento === 'DINHEIRO') return /\bdinheiro\b|\bespecie\b/.test(textoNormalizado);
  if (pagamento === 'CARTAO_CREDITO') return /\bcredito\b|\bcartao\b/.test(textoNormalizado);
  if (pagamento === 'CARTAO_DEBITO') return /\bdebito\b|\bcartao\b/.test(textoNormalizado);

  return false;
}

function extrairPedidoCardapioConfirmacao(mensagem: string) {
  const texto = String(mensagem || '');
  if (!/PEDIDO_CARDAPIO_CONFIRMAR/i.test(texto)) return null;

  const matchPedidoId = texto.match(/Pedido ID:\s*([0-9a-fA-F-]{36})/i);
  if (!matchPedidoId) return null;

  return {
    pedidoId: matchPedidoId[1],
  };
}

async function responderConfirmacaoPedidoCardapio(mensagem: string) {
  const dados = extrairPedidoCardapioConfirmacao(mensagem);
  if (!dados) return null;

  try {
    const pedido: any = await buscarPedidoCardapio(dados.pedidoId);
    const pixPayload = pedido?.mercadoPago?.pix?.payload;
    const qrCodeImageUrl = pedido?.mercadoPago?.pix?.qrCodeImageUrl;
    const pagamentoPendente = pedido?.pagamento === 'PIX' && pedido?.statusPagamento !== 'PAGO';

    const linhas = [
      `Perfeito! Encontrei seu pedido #${pedido.numero}.`,
      '',
      `Status do pedido: ${pedido.status}.`,
      `Status do pagamento: ${pedido.statusPagamento || 'AGUARDANDO'}.`,
    ];

    if (pagamentoPendente && pixPayload) {
      linhas.push('');
      linhas.push('Seu pagamento ainda esta pendente.');
      linhas.push('');
      linhas.push('Vou te reenviar o codigo PIX copia e cola em uma mensagem separada para facilitar a copia.');
      linhas.push('');
      linhas.push('Codigo PIX copia e cola:');
      linhas.push(pixPayload);
      linhas.push('');
      linhas.push('Pague esse codigo no app do seu banco.');
      linhas.push('Assim que o pagamento for aprovado, eu te aviso por aqui e seguimos com o preparo.');
      if (qrCodeImageUrl) {
        linhas.push('');
        linhas.push('QR Code do PIX:');
        linhas.push(qrCodeImageUrl);
      }
    } else if (pedido?.statusPagamento === 'PAGO') {
      linhas.push('');
      linhas.push('Seu pagamento ja foi confirmado e seu pedido esta em andamento.');
    } else {
      linhas.push('');
      linhas.push('Seu pedido foi localizado e ja esta em acompanhamento por aqui.');
    }

    return linhas.join('\n');
  } catch (error) {
    console.error('[ia] Falha ao confirmar pedido vindo do cardapio', error);
    return 'Nao consegui localizar esse pedido agora. Me envie novamente a mensagem de confirmacao do cardapio, por favor.';
  }
}

async function responderCatalogoSemAlucinacao(mensagem: string) {
  const texto = normalizarBuscaTexto(mensagem);
  const tokens = extrairTokensBuscaCatalogo(texto);
  const pediuSabores = mensagemPedeSabores(texto);
  const produtos = await prisma.produto.findMany({
    where: {
      disponivel: true,
      estoque: { gt: 0 },
    },
    orderBy: [{ categoria: 'asc' }, { nome: 'asc' }],
    select: {
      nome: true,
      categoria: true,
      descricao: true,
      tipoVariacao: true,
      controlaEstoquePorVariacao: true,
      preco: true,
      estoque: true,
      variacoes: {
        select: {
          nome: true,
          descricao: true,
          estoque: true,
          estoqueMinimo: true,
        },
        orderBy: { ordem: 'asc' },
      },
    },
    take: 200,
  });

  const produtosDisponiveis = produtos
    .map((produto) => mapearProdutoComEstoqueCalculado(produto, { ocultarVariacoesSemEstoque: true, recalcularDisponibilidade: true }))
    .filter((produto) => produto.disponivel && produto.estoque > 0);

  if (!produtosDisponiveis.length) {
    return 'No momento nao temos produtos disponiveis em estoque. Posso te avisar quando entrar reposicao.';
  }

  const consultaAberta = /(o que tem|quais|mostra|lista|catalogo|cardapio)/i.test(texto);

  let filtrados = produtosDisponiveis;
  if (tokens.length > 0 && !consultaAberta) {
    filtrados = ranquearProdutosPorBusca(produtosDisponiveis, texto, tokens).map((item) => item.produto as typeof produtosDisponiveis[number]);
  }

  if (!filtrados.length) {
    return 'Nao encontrei esse produto em estoque agora. Se quiser, te passo as opcoes disponiveis no momento.';
  }

  if (pediuSabores) {
    const comSabores = filtrados.filter((produto) => obterSaboresProduto(produto).length > 0);
    if (!comSabores.length) {
      return 'Esse produto nao tem sabores cadastrados no momento. Se quiser, eu verifico outra opcao para voce.';
    }

    if (comSabores.length === 1) {
      const produto = comSabores[0];
      return `Os sabores disponiveis de ${produto.nome} sao: ${formatarSaboresProduto(produto)}.`;
    }

    const listaSabores = comSabores.map((produto) => (
      `${produto.nome} - ${formatBRL(produto.preco)}\nSabores: ${formatarSaboresProduto(produto)}`
    ));

    return `Encontrei estes produtos com todos os sabores disponiveis agora:\n${listaSabores.join('\n')}`;
  }

  const lista = filtrados.map((p) => `${p.nome} - ${formatBRL(p.preco)}`);
  const prefixo = consultaAberta || tokens.length === 0
    ? 'Temos disponivel agora:'
    : 'Encontrei em estoque agora:';

  return `${prefixo}\n${lista.join('\n')}`;
}

// ===== TOOLS DE GESTÃƒO =====

function criarToolsGestao() {
  const consultarFaturamento = new DynamicStructuredTool({
    name: 'consultar_faturamento',
    description: 'Consulta o faturamento total em um período. Use quando o usuário perguntar sobre faturamento, receita ou vendas em valor.',
    schema: z.object({
      dataInicio: z.string().optional().describe('Data de início no formato YYYY-MM-DD (opcional, padrão: primeiro dia do mês atual)'),
      dataFim: z.string().optional().describe('Data de fim no formato YYYY-MM-DD (opcional, padrão: dia atual)'),
    }),
    func: async ({ dataInicio, dataFim }) => {
      const now = new Date();
      const inicio = dataInicio
        ? new Date(`${dataInicio}T00:00:00.000`)
        : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const fim = dataFim
        ? new Date(`${dataFim}T23:59:59.999`)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      const lancamentos = await prisma.lancamentoFinanceiro.findMany({
        where: {
          tipo: 'RECEITA',
          data: { gte: inicio, lte: fim },
        },
      });

      const pedidosEntregues = await prisma.pedido.findMany({
        where: {
          status: 'ENTREGUE',
          criadoEm: { gte: inicio, lte: fim },
        },
        select: { total: true },
      });

      const totalLancamentos = lancamentos.reduce((acc, l) => acc + l.valor, 0);
      const totalPedidos = pedidosEntregues.reduce((acc, p) => acc + p.total, 0);
      const total = totalLancamentos > 0 ? totalLancamentos : totalPedidos;
      const origem = totalLancamentos > 0 ? 'lancamentos_financeiros' : 'pedidos_entregues';

      const dataInicioFmt = inicio.toISOString().slice(0, 10);
      const dataFimFmt = fim.toISOString().slice(0, 10);

      return JSON.stringify({
        total,
        origem,
        totalLancamentos,
        totalPedidosEntregues: totalPedidos,
        quantidadeLancamentos: lancamentos.length,
        quantidadePedidosEntregues: pedidosEntregues.length,
        periodo: `${dataInicioFmt} a ${dataFimFmt}`,
      });
    },
  });

  const consultarCustos = new DynamicStructuredTool({
    name: 'consultar_custos',
    description: 'Consulta os custos totais em um perÃ­odo. Use quando o usuÃ¡rio perguntar sobre custos, despesas ou gastos.',
    schema: z.object({
      dataInicio: z.string().describe('Data de inÃ­cio no formato YYYY-MM-DD'),
      dataFim: z.string().describe('Data de fim no formato YYYY-MM-DD'),
    }),
    func: async ({ dataInicio, dataFim }) => {
      const lancamentos = await prisma.lancamentoFinanceiro.findMany({
        where: {
          tipo: 'CUSTO',
          data: { gte: new Date(dataInicio), lte: new Date(dataFim) },
        },
      });
      const total = lancamentos.reduce((acc, l) => acc + l.valor, 0);
      const porCategoria: Record<string, number> = {};
      lancamentos.forEach(l => {
        porCategoria[l.categoria] = (porCategoria[l.categoria] || 0) + l.valor;
      });
      return JSON.stringify({ total, quantidade: lancamentos.length, porCategoria, periodo: `${dataInicio} a ${dataFim}` });
    },
  });

  const consultarLucro = new DynamicStructuredTool({
    name: 'consultar_lucro',
    description: 'Consulta o lucro da empresa em um periodo (lucro = receita - custos).',
    schema: z.object({
      dataInicio: z.string().optional().describe('Data de inicio no formato YYYY-MM-DD (opcional, padrão: primeiro dia do mês atual)'),
      dataFim: z.string().optional().describe('Data de fim no formato YYYY-MM-DD (opcional, padrão: dia atual)'),
    }),
    func: async ({ dataInicio, dataFim }) => {
      const now = new Date();
      const inicio = dataInicio
        ? new Date(`${dataInicio}T00:00:00.000`)
        : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const fim = dataFim
        ? new Date(`${dataFim}T23:59:59.999`)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      const [receitasLancadas, custosLancados, pedidosEntregues] = await Promise.all([
        prisma.lancamentoFinanceiro.findMany({
          where: { tipo: 'RECEITA', data: { gte: inicio, lte: fim } },
          select: { valor: true },
        }),
        prisma.lancamentoFinanceiro.findMany({
          where: { tipo: 'CUSTO', data: { gte: inicio, lte: fim } },
          select: { valor: true },
        }),
        prisma.pedido.findMany({
          where: { status: 'ENTREGUE', criadoEm: { gte: inicio, lte: fim } },
          select: { total: true },
        }),
      ]);

      const receitaLancamentos = receitasLancadas.reduce((acc, item) => acc + item.valor, 0);
      const receitaPedidos = pedidosEntregues.reduce((acc, item) => acc + item.total, 0);
      const receita = receitaLancamentos > 0 ? receitaLancamentos : receitaPedidos;
      const custos = custosLancados.reduce((acc, item) => acc + item.valor, 0);
      const lucro = receita - custos;
      const margemPct = receita > 0 ? (lucro / receita) * 100 : 0;

      return JSON.stringify({
        periodo: `${inicio.toISOString().slice(0, 10)} a ${fim.toISOString().slice(0, 10)}`,
        receita,
        custos,
        lucro,
        margemPct,
        receitaOrigem: receitaLancamentos > 0 ? 'lancamentos_financeiros' : 'pedidos_entregues',
      });
    },
  });

  const enviarFormularioCadastroProduto = new DynamicStructuredTool({
    name: 'enviar_formulario_cadastro_produto',
    description: 'Envia o formulario padrao para cadastro de produto pelo gestor.',
    schema: z.object({}),
    func: async () => {
      return JSON.stringify({
        tipo: 'FORMULARIO_CADASTRO_PRODUTO',
        instrucoes: 'Preencha e me envie exatamente os campos abaixo para eu cadastrar o produto no sistema.',
        camposObrigatorios: [
          'nome',
          'categoria',
          'precoVenda',
          'custoMedio',
          'estoqueInicial',
          'estoqueMinimo',
          'descricao',
        ],
        formulario:
`FORMULÁRIO DE CADASTRO DE PRODUTO
nome:
categoria:
precoVenda:
custoMedio:
estoqueInicial:
estoqueMinimo:
descricao:`,
      });
    },
  });

  const cadastrarProdutoIA = new DynamicStructuredTool({
    name: 'cadastrar_produto_ia',
    description: 'Cadastra novo produto no estoque sem imagem, usando os campos obrigatorios do formulario. Use somente após enviar_formulario_cadastro_produto e receber os dados preenchidos.',
    schema: z.object({
      nome: z.string().describe('Nome do produto'),
      categoria: z.string().describe('Categoria do produto'),
      precoVenda: z.number().describe('Preço de venda do produto'),
      custoMedio: z.number().describe('Custo médio inicial do produto'),
      estoqueInicial: z.number().describe('Quantidade inicial em estoque'),
      estoqueMinimo: z.number().describe('Estoque mínimo de alerta'),
      descricao: z.string().describe('Descrição curta do produto'),
      disponivel: z.boolean().optional().describe('Se o produto inicia disponível (padrão: true)'),
    }),
    func: async ({ nome, categoria, precoVenda, custoMedio, estoqueInicial, estoqueMinimo, descricao, disponivel }) => {
      const nomeLimpo = String(nome || '').trim();
      const categoriaLimpa = String(categoria || '').trim();
      const descricaoLimpa = String(descricao || '').trim();
      const preco = Number(precoVenda);
      const custo = Number(custoMedio);
      const estoque = Number(estoqueInicial);
      const estoqueMin = Number(estoqueMinimo);

      if (!nomeLimpo) return JSON.stringify({ erro: 'Campo obrigatório ausente: nome.' });
      if (!categoriaLimpa) return JSON.stringify({ erro: 'Campo obrigatório ausente: categoria.' });
      if (!descricaoLimpa) return JSON.stringify({ erro: 'Campo obrigatório ausente: descricao.' });
      if (!Number.isFinite(preco) || preco <= 0) return JSON.stringify({ erro: 'precoVenda inválido. Informe valor maior que zero.' });
      if (!Number.isFinite(custo) || custo < 0) return JSON.stringify({ erro: 'custoMedio inválido. Informe valor numérico não negativo.' });
      if (!Number.isFinite(estoque) || estoque < 0 || !Number.isInteger(estoque)) {
        return JSON.stringify({ erro: 'estoqueInicial inválido. Informe número inteiro maior ou igual a zero.' });
      }
      if (!Number.isFinite(estoqueMin) || estoqueMin < 0 || !Number.isInteger(estoqueMin)) {
        return JSON.stringify({ erro: 'estoqueMinimo inválido. Informe número inteiro maior ou igual a zero.' });
      }

      const existente = await prisma.produto.findFirst({
        where: {
          nome: { equals: nomeLimpo, mode: 'insensitive' },
        },
        select: { id: true, nome: true },
      });
      if (existente) {
        return JSON.stringify({
          erro: `Já existe produto com nome "${existente.nome}".`,
          produtoExistenteId: existente.id,
        });
      }

      const produto = await prisma.produto.create({
        data: {
          nome: nomeLimpo,
          categoria: categoriaLimpa,
          descricao: descricaoLimpa,
          preco,
          custoMedio: custo,
          custoUltimaCompra: custo,
          estoque,
          estoqueMinimo: estoqueMin,
          disponivel: disponivel ?? true,
        },
      });

      return JSON.stringify({
        sucesso: true,
        mensagem: `Produto "${produto.nome}" cadastrado com sucesso.`,
        produto: {
          id: produto.id,
          nome: produto.nome,
          categoria: produto.categoria,
          preco: produto.preco,
          custoMedio: produto.custoMedio,
          estoque: produto.estoque,
          estoqueMinimo: produto.estoqueMinimo,
          disponivel: produto.disponivel,
        },
      });
    },
  });

  const consultarVendas = new DynamicStructuredTool({
    name: 'consultar_vendas',
    description: 'Consulta quantidade de vendas/pedidos em um perÃ­odo. Use quando o usuÃ¡rio perguntar quantas vendas, pedidos foram feitos.',
    schema: z.object({
      dataInicio: z.string().describe('Data de inÃ­cio no formato YYYY-MM-DD'),
      dataFim: z.string().describe('Data de fim no formato YYYY-MM-DD'),
      status: z.string().optional().describe('Filtrar por status: RECEBIDO, EM_PREPARO, PRONTO, EM_ENTREGA, ENTREGUE, CANCELADO'),
    }),
    func: async ({ dataInicio, dataFim, status }) => {
      const where: any = {
        criadoEm: { gte: new Date(dataInicio), lte: new Date(dataFim) },
      };
      if (status) where.status = status;
      const pedidos = await prisma.pedido.findMany({ where, include: { itens: true } });
      const totalValor = pedidos.reduce((acc, p) => acc + p.total, 0);
      const porStatus: Record<string, number> = {};
      pedidos.forEach(p => {
        porStatus[p.status] = (porStatus[p.status] || 0) + 1;
      });
      return JSON.stringify({
        quantidadePedidos: pedidos.length,
        valorTotal: totalValor,
        porStatus,
        periodo: `${dataInicio} a ${dataFim}`,
      });
    },
  });

  const consultarEstoque = new DynamicStructuredTool({
    name: 'consultar_estoque',
    description: 'Consulta o estoque atual dos produtos. Use quando o usuÃ¡rio perguntar sobre estoque, produtos disponÃ­veis, quantidade em estoque.',
    schema: z.object({
      produto: z.string().optional().describe('Nome do produto para filtrar (busca parcial)'),
      categoria: z.string().optional().describe('Categoria para filtrar'),
      apenasAlerta: z.boolean().optional().describe('Se true, retorna apenas produtos com estoque abaixo do mÃ­nimo'),
    }),
    func: async ({ produto, categoria, apenasAlerta }) => {
      const where: any = {};
      if (produto) where.nome = { contains: produto, mode: 'insensitive' };
      if (categoria) where.categoria = { contains: categoria, mode: 'insensitive' };
      const produtos = await prisma.produto.findMany({ where });
      let resultado = produtos;
      if (apenasAlerta) {
        resultado = produtos.filter(p => p.estoque <= p.estoqueMinimo);
      }
      return JSON.stringify(resultado.map(p => ({
        id: p.id,
        nome: p.nome,
        categoria: p.categoria,
        estoque: p.estoque,
        estoqueMinimo: p.estoqueMinimo,
        preco: p.preco,
        alerta: p.estoque <= p.estoqueMinimo,
      })));
    },
  });

  const atualizarEstoque = new DynamicStructuredTool({
    name: 'atualizar_estoque',
    description: 'Atualiza o estoque de um produto. Use quando o usuÃ¡rio pedir para adicionar, remover ou ajustar estoque de um produto.',
    schema: z.object({
      produtoId: z.string().optional().describe('ID do produto (opcional se informar nome)'),
      produtoNome: z.string().optional().describe('Nome do produto para localizar quando nÃ£o houver ID'),
      tipo: z.enum(['ENTRADA', 'SAIDA', 'AJUSTE']).describe('Tipo da movimentaÃ§Ã£o: ENTRADA (adicionar), SAIDA (remover), AJUSTE (definir valor exato)'),
      quantidade: z.number().describe('Quantidade a movimentar (positivo)'),
      motivo: z.string().optional().describe('Motivo da movimentaÃ§Ã£o'),
    }),
    func: async ({ produtoId, produtoNome, tipo, quantidade, motivo }) => {
      if (!produtoId && !produtoNome) {
        return JSON.stringify({
          erro: 'Informe o produto por ID ou nome para atualizar o estoque.',
        });
      }

      let produto = null as any;

      if (produtoId) {
        produto = await prisma.produto.findUnique({ where: { id: produtoId } });
      }

      if (!produto && produtoNome) {
        const matches = await prisma.produto.findMany({
          where: { nome: { contains: produtoNome, mode: 'insensitive' } },
          orderBy: { nome: 'asc' },
          take: 6,
          select: { id: true, nome: true, estoque: true },
        });

        if (matches.length === 0) {
          return JSON.stringify({ erro: `Produto não encontrado para: ${produtoNome}` });
        }

        if (matches.length > 1) {
          return JSON.stringify({
            erro: 'Encontrei mais de um produto com esse nome. Especifique melhor.',
            opcoes: matches.map((p) => ({ id: p.id, nome: p.nome, estoque: p.estoque })),
          });
        }

        produto = await prisma.produto.findUnique({ where: { id: matches[0].id } });
      }

      if (!produto) return JSON.stringify({ erro: 'Produto nÃ£o encontrado' });

      let novoEstoque = produto.estoque;
      if (tipo === 'ENTRADA') novoEstoque += quantidade;
      else if (tipo === 'SAIDA') novoEstoque -= quantidade;
      else novoEstoque = quantidade; // AJUSTE

      if (novoEstoque < 0) return JSON.stringify({ erro: 'Estoque nÃ£o pode ficar negativo' });

      await prisma.produto.update({ where: { id: produto.id }, data: { estoque: novoEstoque } });
      await prisma.movimentacaoEstoque.create({
        data: { produtoId: produto.id, tipo, quantidade, motivo: motivo || `AtualizaÃ§Ã£o via IA - ${tipo}` },
      });

      return JSON.stringify({
        sucesso: true,
        produtoId: produto.id,
        produto: produto.nome,
        estoqueAnterior: produto.estoque,
        novoEstoque,
        tipo,
        quantidade,
      });
    },
  });

  const consultarClientes = new DynamicStructuredTool({
    name: 'consultar_clientes',
    description: 'Consulta informaÃ§Ãµes sobre clientes. Use quando o usuÃ¡rio perguntar sobre clientes, base de clientes, etc.',
    schema: z.object({
      nome: z.string().optional().describe('Nome do cliente para buscar'),
      apenasAtivos: z.boolean().optional().describe('Se true, retorna apenas clientes ativos'),
    }),
    func: async ({ nome, apenasAtivos }) => {
      const where: any = {};
      if (nome) where.nome = { contains: nome, mode: 'insensitive' };
      if (apenasAtivos) where.ativo = true;
      const clientes = await prisma.cliente.findMany({ where, take: 20 });
      return JSON.stringify({
        total: clientes.length,
        clientes: clientes.map(c => ({
          id: c.id,
          nome: c.nome,
          telefone: c.telefone,
          email: c.email,
          ativo: c.ativo,
        })),
      });
    },
  });

  const consultarProdutosMaisVendidos = new DynamicStructuredTool({
    name: 'consultar_produtos_mais_vendidos',
    description: 'Consulta os produtos mais vendidos. Use quando o usuÃ¡rio perguntar sobre produtos mais vendidos, ranking de vendas.',
    schema: z.object({
      dataInicio: z.string().describe('Data de inÃ­cio no formato YYYY-MM-DD'),
      dataFim: z.string().describe('Data de fim no formato YYYY-MM-DD'),
      limite: z.number().optional().describe('Quantidade de produtos a retornar (padrÃ£o 10)'),
    }),
    func: async ({ dataInicio, dataFim, limite }) => {
      const itens = await prisma.itemPedido.findMany({
        where: {
          pedido: {
            criadoEm: { gte: new Date(dataInicio), lte: new Date(dataFim) },
            status: { not: 'CANCELADO' },
          },
        },
        include: { produto: true },
      });
      const ranking: Record<string, { nome: string; quantidade: number; valor: number }> = {};
      itens.forEach(item => {
        if (!ranking[item.produtoId]) {
          ranking[item.produtoId] = { nome: item.produto.nome, quantidade: 0, valor: 0 };
        }
        ranking[item.produtoId].quantidade += item.quantidade;
        ranking[item.produtoId].valor += item.subtotal;
      });
      const sorted = Object.values(ranking).sort((a, b) => b.quantidade - a.quantidade).slice(0, limite || 10);
      return JSON.stringify(sorted);
    },
  });

  return [
    consultarFaturamento,
    consultarCustos,
    consultarLucro,
    consultarVendas,
    consultarEstoque,
    atualizarEstoque,
    enviarFormularioCadastroProduto,
    cadastrarProdutoIA,
    consultarClientes,
    consultarProdutosMaisVendidos,
  ];
}

// ===== TOOLS DE ATENDIMENTO =====

function criarToolsAtendimento(contexto: { mensagensUsuarioRecentes: string[] } = { mensagensUsuarioRecentes: [] }) {
  const historicoUsuario = contexto.mensagensUsuarioRecentes.filter(Boolean).join('\n');

  const consultarCatalogoProdutos = new DynamicStructuredTool({
    name: 'consultar_catalogo_produtos',
    description: 'Lista produtos por nome/categoria para atendimento ao cliente com nome, preco, estoque, categoria, sabores/variacoes e foto.',
    schema: z.object({
      busca: z.string().optional().describe('Nome ou trecho do nome do produto'),
      categoria: z.string().optional().describe('Categoria do produto'),
      apenasDisponiveis: z.boolean().optional().describe('Se true, retorna apenas produtos disponiveis'),
      limite: z.number().optional().describe('Quantidade maxima de produtos retornados (padrao 12)'),
    }),
    func: async ({ busca, categoria, apenasDisponiveis, limite }) => {
      const textoBusca = normalizarBuscaTexto(`${busca || ''} ${categoria || ''}`.trim());
      const tokensBusca = extrairTokensBuscaCatalogo(textoBusca);
      const take = Number.isFinite(Number(limite)) ? Math.min(Math.max(Number(limite), 1), 30) : 12;
      const produtos = await prisma.produto.findMany({
        where: {
          ...(apenasDisponiveis !== false ? { disponivel: true } : {}),
          estoque: { gt: 0 },
        },
        orderBy: [{ categoria: 'asc' }, { nome: 'asc' }],
        take: Math.max(take * 3, 30),
        select: {
          id: true,
          nome: true,
          descricao: true,
          categoria: true,
          tipoVariacao: true,
          controlaEstoquePorVariacao: true,
          preco: true,
          estoque: true,
          disponivel: true,
          imagemUrl: true,
          variacoes: {
            select: {
              nome: true,
              descricao: true,
              estoque: true,
              estoqueMinimo: true,
            },
            orderBy: { ordem: 'asc' },
          },
        },
      });

      const produtosDisponiveis = produtos
        .map((produto) => mapearProdutoComEstoqueCalculado(produto, { ocultarVariacoesSemEstoque: true, recalcularDisponibilidade: true }))
        .filter((produto) => (apenasDisponiveis !== false ? produto.disponivel && produto.estoque > 0 : true));

      const produtosFiltrados = (textoBusca || categoria)
        ? ranquearProdutosPorBusca(produtosDisponiveis, textoBusca, tokensBusca).map((item) => item.produto as typeof produtosDisponiveis[number])
        : produtosDisponiveis;

      const filtrados = produtosFiltrados.slice(0, take).map((p) => ({
        id: p.id,
        nome: p.nome,
        descricao: p.descricao,
        categoria: p.categoria,
        tipoVariacao: p.tipoVariacao,
        preco: p.preco,
        precoFormatado: formatBRL(p.preco),
        estoque: p.estoque,
        disponivel: p.disponivel && p.estoque > 0,
        imagemUrl: normalizeImageUrl(p.imagemUrl),
        sabores: Array.isArray(p.variacoes) ? p.variacoes.map((variacao) => variacao.nome).filter(Boolean) : [],
        variacoes: p.variacoes || [],
      }));

      return JSON.stringify({
        total: filtrados.length,
        produtos: filtrados,
      });
    },
  });

  const consultarProdutoDetalhado = new DynamicStructuredTool({
    name: 'consultar_produto_detalhado',
    description: 'Busca um produto especifico para confirmar preco, estoque, categoria, sabores/variacoes e foto.',
    schema: z.object({
      produtoId: z.string().optional().describe('ID do produto'),
      nome: z.string().optional().describe('Nome do produto para busca'),
    }),
    func: async ({ produtoId, nome }) => {
      if (!produtoId && !nome) {
        return JSON.stringify({ erro: 'Informe produtoId ou nome para buscar o produto.' });
      }

      let produto: any = null;
      if (produtoId) {
        produto = await prisma.produto.findUnique({
          where: { id: produtoId },
          select: {
            id: true,
            nome: true,
            descricao: true,
            categoria: true,
            tipoVariacao: true,
            controlaEstoquePorVariacao: true,
            preco: true,
            estoque: true,
            disponivel: true,
            imagemUrl: true,
            variacoes: {
              select: { nome: true, descricao: true, estoque: true, estoqueMinimo: true },
              orderBy: { ordem: 'asc' },
            },
          },
        });
        if (produto) {
          produto = mapearProdutoComEstoqueCalculado(produto, { ocultarVariacoesSemEstoque: true, recalcularDisponibilidade: true });
        }
      }

      if (!produto && nome) {
        const matches = await prisma.produto.findMany({
          where: {
            disponivel: true,
            estoque: { gt: 0 },
          },
          orderBy: { nome: 'asc' },
          take: 200,
          select: {
            id: true,
            nome: true,
            descricao: true,
            categoria: true,
            tipoVariacao: true,
            controlaEstoquePorVariacao: true,
            preco: true,
            estoque: true,
            disponivel: true,
            imagemUrl: true,
            variacoes: {
              select: { nome: true, descricao: true, estoque: true, estoqueMinimo: true },
              orderBy: { ordem: 'asc' },
            },
          },
        });
        const matchesDisponiveis = matches
          .map((entry) => mapearProdutoComEstoqueCalculado(entry, { ocultarVariacoesSemEstoque: true, recalcularDisponibilidade: true }))
          .filter((entry) => entry.disponivel && entry.estoque > 0);
        const { produto: melhorProduto, opcoes } = resolverMelhorProdutoPorNome(matchesDisponiveis, nome);

        if (!melhorProduto && opcoes.length === 0) {
          return JSON.stringify({ erro: `Nao encontrei produto com o nome: ${nome}` });
        }

        if (!melhorProduto && opcoes.length > 1) {
          return JSON.stringify({
            erro: 'Encontrei mais de um produto com esse nome. Confirme qual voce quer.',
            opcoes: opcoes.map((p) => ({
              id: p.id,
              nome: p.nome,
              categoria: p.categoria,
              tipoVariacao: p.tipoVariacao,
              preco: p.preco,
              precoFormatado: formatBRL(p.preco),
              estoque: p.estoque,
              sabores: Array.isArray(p.variacoes) ? p.variacoes.map((variacao) => variacao.nome).filter(Boolean) : [],
              imagemUrl: normalizeImageUrl(p.imagemUrl),
            })),
          });
        }

        produto = melhorProduto || opcoes[0];
      }

      if (!produto) return JSON.stringify({ erro: 'Produto nao encontrado.' });
      if (!produto.disponivel || produto.estoque <= 0) {
        return JSON.stringify({
          erro: 'Produto sem estoque no momento.',
          id: produto.id,
          nome: produto.nome,
          estoque: produto.estoque,
        });
      }

      return JSON.stringify({
        id: produto.id,
        nome: produto.nome,
        descricao: produto.descricao,
        categoria: produto.categoria,
        tipoVariacao: produto.tipoVariacao,
        preco: produto.preco,
        precoFormatado: formatBRL(produto.preco),
        estoque: produto.estoque,
        disponivel: produto.disponivel && produto.estoque > 0,
        sabores: Array.isArray(produto.variacoes) ? produto.variacoes.map((variacao: any) => variacao.nome).filter(Boolean) : [],
        variacoes: produto.variacoes || [],
        imagemUrl: normalizeImageUrl(produto.imagemUrl),
      });
    },
  });

  const montarResumoPedido = new DynamicStructuredTool({
    name: 'montar_resumo_pedido',
    description: 'Monta resumo de pedido com subtotal, frete e total antes do fechamento.',
    schema: z.object({
      itens: z.array(z.object({
        produtoId: z.string().optional(),
        produtoNome: z.string().optional(),
        variacaoNome: z.string().optional(),
        quantidade: z.number(),
      })).describe('Itens do pedido com produtoId ou produtoNome e quantidade'),
      tipoEntrega: z.enum(['DELIVERY', 'RETIRADA']).optional().describe('Tipo de entrega'),
      enderecoEntrega: z.string().optional().describe('Endereco completo do cliente para delivery (rua, numero, bairro). Usado para calcular a distancia e o frete reais.'),
      cepEntrega: z.string().optional().describe('CEP do cliente para delivery, ajuda a localizar o endereco com mais precisao.'),
    }),
    func: async ({ itens, tipoEntrega, enderecoEntrega, cepEntrega }) => {
      if (!Array.isArray(itens) || itens.length === 0) {
        return JSON.stringify({ erro: 'Pedido vazio. Informe ao menos um item.' });
      }

      const itensResolvidos: Array<any> = [];
      const pendencias: Array<any> = [];

      for (const item of itens) {
        const quantidade = Number(item?.quantidade || 0);
        if (!Number.isFinite(quantidade) || quantidade <= 0) {
          pendencias.push({ item, erro: 'Quantidade invalida.' });
          continue;
        }

        let produto: any = null;
        if (item?.produtoId) {
          produto = await prisma.produto.findUnique({
            where: { id: String(item.produtoId) },
            select: {
              id: true,
              nome: true,
              categoria: true,
              descricao: true,
              tipoVariacao: true,
              controlaEstoquePorVariacao: true,
              preco: true,
              estoque: true,
              disponivel: true,
              imagemUrl: true,
              variacoes: {
                select: { nome: true, descricao: true, estoque: true, estoqueMinimo: true },
                orderBy: { ordem: 'asc' },
              },
            },
          });
          if (produto) {
            produto = mapearProdutoComEstoqueCalculado(produto, { ocultarVariacoesSemEstoque: true, recalcularDisponibilidade: true });
          }
        } else if (item?.produtoNome) {
          const matches = await prisma.produto.findMany({
            where: {
              disponivel: true,
              estoque: { gt: 0 },
            },
            orderBy: { nome: 'asc' },
            take: 200,
            select: {
              id: true,
              nome: true,
              categoria: true,
              descricao: true,
              tipoVariacao: true,
              controlaEstoquePorVariacao: true,
              preco: true,
              estoque: true,
              disponivel: true,
              imagemUrl: true,
              variacoes: {
                select: { nome: true, descricao: true, estoque: true, estoqueMinimo: true },
                orderBy: { ordem: 'asc' },
              },
            },
          });
          const matchesDisponiveis = matches
            .map((entry) => mapearProdutoComEstoqueCalculado(entry, { ocultarVariacoesSemEstoque: true, recalcularDisponibilidade: true }))
            .filter((entry) => entry.disponivel && entry.estoque > 0);

          const { produto: melhorProduto, opcoes } = resolverMelhorProdutoPorNome(matchesDisponiveis, String(item.produtoNome));

          if (melhorProduto) {
            produto = melhorProduto;
          } else if (opcoes.length > 1) {
            pendencias.push({
              item,
              erro: 'Nome de produto ambiguo.',
              opcoes: opcoes.map((p) => ({ id: p.id, nome: p.nome, preco: p.preco, precoFormatado: formatBRL(p.preco) })),
            });
            continue;
          } else if (opcoes.length === 1) {
            produto = opcoes[0];
          }
        }

        if (!produto) {
          pendencias.push({ item, erro: 'Produto nao encontrado.' });
          continue;
        }

        if (!produto.disponivel || produto.estoque < quantidade) {
          pendencias.push({
            item,
            erro: 'Produto indisponivel ou sem estoque suficiente.',
            produto: { id: produto.id, nome: produto.nome, estoque: produto.estoque, disponivel: produto.disponivel },
          });
          continue;
        }

        const variacaoInformada = String(item?.variacaoNome || '').trim();
        const saboresDisponiveis = obterSaboresProduto(produto);
        const variacaoResolvida = resolverVariacaoProduto(produto, variacaoInformada);

        if (produtoExigeVariacao(produto) && !variacaoResolvida) {
          pendencias.push({
            item,
            erro: variacaoInformada
              ? `Variacao nao encontrada para "${produto.nome}".`
              : `Escolha o ${produto.tipoVariacao || 'sabor'} de "${produto.nome}" antes de confirmar o pedido.`,
            produto: {
              id: produto.id,
              nome: produto.nome,
              tipoVariacao: produto.tipoVariacao || 'Sabor',
              sabores: saboresDisponiveis,
            },
          });
          continue;
        }

        if (produtoControlaEstoquePorVariacao(produto) && Number(variacaoResolvida?.estoque || 0) < quantidade) {
          pendencias.push({
            item,
            erro: `Estoque insuficiente para o sabor "${variacaoResolvida?.nome}" de "${produto.nome}".`,
            produto: {
              id: produto.id,
              nome: produto.nome,
              tipoVariacao: produto.tipoVariacao || 'Sabor',
              sabores: saboresDisponiveis,
            },
          });
          continue;
        }

        const subtotal = produto.preco * quantidade;
        itensResolvidos.push({
          produtoId: produto.id,
          nome: produto.nome,
          variacaoNome: variacaoResolvida?.nome || null,
          descricaoItem: variacaoResolvida?.nome ? `${produto.nome} - ${variacaoResolvida.nome}` : produto.nome,
          quantidade,
          precoUnitario: produto.preco,
          precoUnitarioFormatado: formatBRL(produto.preco),
          subtotal,
          subtotalFormatado: formatBRL(subtotal),
          imagemUrl: normalizeImageUrl(produto.imagemUrl),
        });
      }

      const subtotalPedido = itensResolvidos.reduce((acc, i) => acc + i.subtotal, 0);
      const entrega = tipoEntrega || 'DELIVERY';
      let frete = 0;
      let freteInfo: any = { tipoEntrega: entrega };
      let total = subtotalPedido;
      let bloqueios: string[] = [];

      if (entrega === 'DELIVERY') {
        if (enderecoEntrega?.trim() && !cepEntrega?.trim()) {
          freteInfo = { ...freteInfo, aviso: 'Informe o CEP do cliente para calcular o frete com precisao.' };
        } else if (enderecoEntrega?.trim()) {
          try {
            const resultadoFrete = await calcularFreteCardapio({
              enderecoEntrega: enderecoEntrega.trim(),
              cepEntrega: cepEntrega?.trim() || undefined,
            });
            freteInfo = { ...freteInfo, ...resultadoFrete };
            if (!resultadoFrete.atende) {
              if ((resultadoFrete as any).acimaDoLimite) {
                // Acima de 12km: nao recusar. Oferecer retirada (balcao ou Uber Flash/99).
                freteInfo = {
                  ...freteInfo,
                  ofereceRetirada: true,
                  mensagemForaDeArea: (resultadoFrete as any).mensagemForaDeArea,
                };
                bloqueios.push(
                  `Endereco a ${Number(resultadoFrete.distanciaKm || 0).toFixed(1)}km (acima de 12km): enviar ao cliente exatamente a mensagem em mensagemForaDeArea e, se ele concordar, fechar como RETIRADA.`,
                );
              } else {
                bloqueios.push(String(resultadoFrete.motivo || 'Endereco fora da area de atendimento.'));
              }
            } else {
              frete = resultadoFrete.frete || 0;
              total += frete;
            }
          } catch (error: any) {
            const motivo = String(error?.message || 'Nao foi possivel calcular o frete para o endereco informado.');
            freteInfo = { ...freteInfo, erro: motivo };
            bloqueios.push(motivo);
          }
        } else {
          freteInfo = { ...freteInfo, aviso: 'Informe o endereco completo do cliente para calcular o frete.' };
        }
      }

      return JSON.stringify({
        itens: itensResolvidos,
        pendencias,
        subtotal: subtotalPedido,
        subtotalFormatado: formatBRL(subtotalPedido),
        frete,
        freteFormatado: formatBRL(frete),
        total,
        totalFormatado: formatBRL(total),
        freteInfo,
        avisoHorarioEntrega: entrega === 'DELIVERY' ? ATENDIMENTO_AVISO_HORARIO_ENTREGA : null,
        prontoParaFechar: itensResolvidos.length > 0 && pendencias.length === 0 && bloqueios.length === 0,
        bloqueios,
      });
    },
  });

  const criarPedidoWhatsapp = new DynamicStructuredTool({
    name: 'criar_pedido_whatsapp',
    description: 'Cria e cadastra o pedido no sistema da loja quando o cliente confirmar fechamento. Se for PIX, exige email do cliente e retorna o codigo PIX e o QR Code.',
    schema: z.object({
      nomeCliente: z.string().describe('Nome do cliente'),
      telefoneCliente: z.string().describe('Telefone do cliente com DDD'),
      emailCliente: z.string().optional().describe('Email do cliente. Obrigatorio para pagamento via PIX.'),
      tipoEntrega: z.enum(['DELIVERY', 'RETIRADA']).describe('Tipo de entrega'),
      enderecoEntrega: z.string().optional().describe('Endereco completo para delivery'),
      cepEntrega: z.string().optional().describe('CEP para delivery'),
      observacoes: z.string().optional().describe('Observacoes do pedido'),
      pagamento: z.enum(['PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO']).describe('Forma de pagamento escolhida pelo cliente'),
      precisaTroco: z.boolean().optional().describe('Se pagamento for em dinheiro, informar se precisa de troco'),
      valorTrocoPara: z.number().optional().describe('Se precisa de troco em dinheiro, informar para qual valor da nota'),
      itens: z.array(z.object({
        produtoId: z.string().optional(),
        produtoNome: z.string().optional(),
        variacaoNome: z.string().optional().describe('Sabor/variacao escolhida pelo cliente quando o produto exigir'),
        quantidade: z.number(),
      })).describe('Itens do pedido com produtoId ou produtoNome e quantidade'),
    }),
    func: async (payload) => {
      const {
        nomeCliente,
        telefoneCliente,
        emailCliente,
        tipoEntrega,
        enderecoEntrega,
        cepEntrega,
        observacoes,
        pagamento,
        precisaTroco,
        valorTrocoPara,
        itens,
      } = payload;

      if (!nomeCliente?.trim()) {
        return JSON.stringify({ erro: 'Nome do cliente e obrigatorio.' });
      }
      if (!telefoneCliente?.trim()) {
        return JSON.stringify({ erro: 'Telefone do cliente e obrigatorio.' });
      }
      if (tipoEntrega === 'DELIVERY' && !enderecoEntrega?.trim()) {
        return JSON.stringify({ erro: 'Endereco de entrega e obrigatorio para delivery.' });
      }
      if (tipoEntrega === 'DELIVERY' && !cepEntrega?.trim()) {
        return JSON.stringify({ erro: 'CEP e obrigatorio para delivery (usado para localizar o endereco e calcular o frete).' });
      }
      if (!Array.isArray(itens) || itens.length === 0) {
        return JSON.stringify({ erro: 'Pedido sem itens.' });
      }
      if (!pagamento) {
        return JSON.stringify({ erro: 'Forma de pagamento obrigatoria antes de criar o pedido.' });
      }
      if (!clienteConfirmouFormaPagamento(historicoUsuario, pagamento)) {
        return JSON.stringify({
          erro: 'Antes de criar o pedido, confirme explicitamente com o cliente a forma de pagamento escolhida.',
        });
      }
      if (pagamento === 'PIX' && !isMercadoPagoConfigured()) {
        return JSON.stringify({
          erro: 'PIX indisponivel no momento porque o Mercado Pago ainda nao foi configurado no backend.',
        });
      }
      if (pagamento === 'PIX' && !emailCliente?.trim()) {
        return JSON.stringify({
          erro: 'Para pagamento via PIX, informe o email do cliente antes de fechar o pedido.',
        });
      }
      if (pagamento === 'DINHEIRO') {
        if (typeof precisaTroco !== 'boolean') {
          return JSON.stringify({
            erro: 'Para pagamento em dinheiro, confirme se precisa de troco (sim ou nao) antes de fechar o pedido.',
          });
        }
        if (precisaTroco) {
          const valorTroco = Number(valorTrocoPara || 0);
          if (!Number.isFinite(valorTroco) || valorTroco <= 0) {
            return JSON.stringify({
              erro: 'Informe o valor da nota para troco no pagamento em dinheiro.',
            });
          }
        }
      }

      const itensResolvidos: Array<{ produtoId: string; quantidade: number; variacaoNome?: string }> = [];
      const pendencias: Array<any> = [];

      for (const item of itens) {
        const quantidade = Number(item?.quantidade || 0);
        if (!Number.isFinite(quantidade) || quantidade <= 0) {
          pendencias.push({ item, erro: 'Quantidade invalida.' });
          continue;
        }

        let produtoId = String(item?.produtoId || '').trim();
        if (!produtoId) {
          const produtoNome = String(item?.produtoNome || '').trim();
          if (!produtoNome) {
            pendencias.push({ item, erro: 'Informe produtoId ou produtoNome.' });
            continue;
          }

          const matches = await prisma.produto.findMany({
            where: {
              disponivel: true,
              estoque: { gt: 0 },
            },
            orderBy: { nome: 'asc' },
            take: 200,
            select: {
              id: true,
              nome: true,
              categoria: true,
              descricao: true,
              tipoVariacao: true,
              controlaEstoquePorVariacao: true,
              preco: true,
              estoque: true,
              disponivel: true,
              imagemUrl: true,
              variacoes: {
                select: { nome: true, descricao: true, estoque: true, estoqueMinimo: true },
                orderBy: { ordem: 'asc' },
              },
            },
          });
          const matchesDisponiveis = matches
            .map((entry) => mapearProdutoComEstoqueCalculado(entry, { ocultarVariacoesSemEstoque: true, recalcularDisponibilidade: true }))
            .filter((entry) => entry.disponivel && entry.estoque > 0);

          const { produto: melhorProduto, opcoes } = resolverMelhorProdutoPorNome(matchesDisponiveis, produtoNome);

          if (!melhorProduto && opcoes.length === 0) {
            pendencias.push({ item, erro: `Produto nao encontrado: ${produtoNome}` });
            continue;
          }

          if (!melhorProduto && opcoes.length > 1) {
            pendencias.push({
              item,
              erro: `Produto ambiguo: ${produtoNome}`,
              opcoes: opcoes.map((produto) => ({ id: produto.id, nome: produto.nome, tipoVariacao: produto.tipoVariacao })),
            });
            continue;
          }

          produtoId = String((melhorProduto || opcoes[0]).id);
        }

        const produtoSelecionado = await prisma.produto.findUnique({
          where: { id: produtoId },
          select: {
            id: true,
            nome: true,
            tipoVariacao: true,
            controlaEstoquePorVariacao: true,
            disponivel: true,
            estoque: true,
            variacoes: {
              select: { id: true, nome: true, descricao: true, estoque: true, estoqueMinimo: true },
              orderBy: { ordem: 'asc' },
            },
          },
        });

        if (!produtoSelecionado) {
          pendencias.push({ item, erro: `Produto nao encontrado para fechamento: ${produtoId}` });
          continue;
        }

        const variacaoInformada = String(item?.variacaoNome || '').trim();
        const produtoPreparado = mapearProdutoComEstoqueCalculado(produtoSelecionado, { ocultarVariacoesSemEstoque: true, recalcularDisponibilidade: true });
        const saboresDisponiveis = obterSaboresProduto(produtoPreparado);
        const variacaoResolvida = resolverVariacaoProduto(produtoPreparado, variacaoInformada);

        if (produtoExigeVariacao(produtoPreparado) && !variacaoResolvida) {
          pendencias.push({
            item,
            erro: variacaoInformada
              ? `Variacao nao encontrada para "${produtoSelecionado.nome}".`
              : `Escolha o ${produtoSelecionado.tipoVariacao || 'sabor'} de "${produtoSelecionado.nome}" antes de fechar o pedido.`,
            produto: {
              id: produtoSelecionado.id,
              nome: produtoSelecionado.nome,
              tipoVariacao: produtoSelecionado.tipoVariacao || 'Sabor',
              sabores: saboresDisponiveis,
            },
          });
          continue;
        }

        if (produtoControlaEstoquePorVariacao(produtoPreparado) && Number(variacaoResolvida?.estoque || 0) < quantidade) {
          pendencias.push({
            item,
            erro: `Estoque insuficiente para o sabor "${variacaoResolvida?.nome}" de "${produtoSelecionado.nome}".`,
            produto: {
              id: produtoSelecionado.id,
              nome: produtoSelecionado.nome,
              tipoVariacao: produtoSelecionado.tipoVariacao || 'Sabor',
              sabores: saboresDisponiveis,
            },
          });
          continue;
        }

        itensResolvidos.push({
          produtoId,
          quantidade,
          variacaoNome: variacaoResolvida?.nome || undefined,
        });
      }

      if (pendencias.length > 0) {
        return JSON.stringify({
          erro: 'Nao foi possivel cadastrar o pedido. Existem pendencias nos itens.',
          pendencias,
        });
      }

      const pagamentoFinal = pagamento === 'PIX' ? 'PIX' : 'PAGAR_NA_ENTREGA';
      const pagamentoEntregaMetodoFinal =
        pagamento === 'DINHEIRO'
          ? 'DINHEIRO'
          : pagamento === 'CARTAO_DEBITO'
            ? 'CARTAO_DEBITO'
            : 'CARTAO_CREDITO';

      try {
        const pedido = await criarPedidoCardapio({
          nomeCliente: nomeCliente.trim(),
          telefoneCliente: telefoneCliente.trim(),
          emailCliente: emailCliente?.trim() || undefined,
          cepEntrega: cepEntrega?.trim() || undefined,
          enderecoEntrega: tipoEntrega === 'DELIVERY' ? enderecoEntrega?.trim() : undefined,
          tipo: tipoEntrega,
          pagamento: pagamentoFinal,
          pagamentoEntregaMetodo: pagamentoFinal === 'PAGAR_NA_ENTREGA' ? pagamentoEntregaMetodoFinal : undefined,
          precisaTroco: pagamento === 'DINHEIRO' ? precisaTroco : undefined,
          valorTrocoPara: pagamento === 'DINHEIRO' && precisaTroco ? Number(valorTrocoPara) : undefined,
          observacoes: observacoes?.trim() || undefined,
          itens: itensResolvidos,
        });

        await prisma.pedido.update({
          where: { id: pedido.id },
          data: { origem: 'WHATSAPP' },
        });

        const financeiro = (pedido as any).financeiro || {};
        const subtotalProdutos = Number(
          financeiro.subtotalProdutos ?? (((pedido as any).itens || []).reduce((acc: number, item: any) => acc + Number(item?.subtotal || 0), 0)),
        );
        const fretePedido = pedido.tipo === 'DELIVERY' ? Number(financeiro.frete || 0) : 0;
        const acrescimoCartao = Number(financeiro.acrescimoCartao || 0);
        const partesFinanceiras = [`Produtos: ${formatBRL(subtotalProdutos)}`];
        if (pedido.tipo === 'DELIVERY') partesFinanceiras.push(`Frete: ${formatBRL(fretePedido)}`);
        if (acrescimoCartao > 0) partesFinanceiras.push(`Acrescimo cartao: ${formatBRL(acrescimoCartao)}`);
        const resumoFinanceiro = `${partesFinanceiras.join(' + ')} = Total: ${formatBRL(pedido.total)}`;
        const pixData = pedido.mercadoPago?.pix || null;

        return JSON.stringify({
          sucesso: true,
          pedidoId: pedido.id,
          numeroPedido: pedido.numero,
          subtotalProdutos,
          subtotalProdutosFormatado: formatBRL(subtotalProdutos),
          frete: fretePedido,
          freteFormatado: formatBRL(fretePedido),
          acrescimoCartao,
          acrescimoCartaoFormatado: formatBRL(acrescimoCartao),
          total: pedido.total,
          totalFormatado: formatBRL(pedido.total),
          resumoFinanceiro,
          status: pedido.status,
          statusPagamento: pedido.statusPagamento,
          pagamento: pedido.pagamento,
          pagamentoSelecionadoCliente: pagamento,
          pagamentoNaEntrega: pagamentoFinal === 'PAGAR_NA_ENTREGA',
          mensagemPagamento: pagamento === 'PIX'
            ? 'Pagamento via PIX gerado com sucesso.'
            : `Pagamento ${pagamento === 'DINHEIRO' ? 'em dinheiro' : 'em cartao'} sera feito na hora da ${tipoEntrega === 'RETIRADA' ? 'retirada' : 'entrega'}.${
              pagamento === 'DINHEIRO'
                ? precisaTroco
                  ? ` Troco para R$ ${Number(valorTrocoPara).toFixed(2)}.`
                  : ' Sem troco.'
                : ''
            }`,
          tipoEntrega: pedido.tipo,
          avisoHorarioEntrega: pedido.tipo === 'DELIVERY' ? ATENDIMENTO_AVISO_HORARIO_ENTREGA : null,
          mensagem: `Pedido #${pedido.numero} cadastrado com sucesso. ${resumoFinanceiro}${
            pedido.tipo === 'DELIVERY' ? ` ${ATENDIMENTO_AVISO_HORARIO_ENTREGA}` : ''
          }`,
          mercadoPago: pedido.mercadoPago || null,
          pix: pixData
            ? {
                copiaCola: pixData.payload || null,
                qrCodeImageUrl: pixData.qrCodeImageUrl || null,
                expirationDate: pixData.expirationDate || null,
              }
            : null,
        });
      } catch (error: any) {
        return JSON.stringify({
          erro: error?.message || 'Falha ao cadastrar pedido no sistema.',
        });
      }
    },
  });

  const consultarCepTool = new DynamicStructuredTool({
    name: 'consultar_cep',
    description: 'Busca o endereco oficial (rua, bairro, cidade) a partir do CEP. Use no inicio do delivery para confirmar o endereco com o cliente antes de pedir o numero.',
    schema: z.object({
      cep: z.string().describe('CEP do cliente (8 digitos)'),
    }),
    func: async ({ cep }) => {
      try {
        const endereco = await buscarEnderecoPorCep(cep);
        return JSON.stringify({
          ...endereco,
          mensagemConfirmacao: `Confirma se o endereco e: ${endereco.enderecoFormatado}, ${endereco.cidade}-${endereco.uf}?`,
        });
      } catch (error: any) {
        return JSON.stringify({ erro: error?.message || 'Nao foi possivel localizar o CEP.' });
      }
    },
  });

  const calcularFrete = new DynamicStructuredTool({
    name: 'calcular_frete_entrega',
    description: 'Calcula o frete real a partir do endereco do cliente (distancia de rota dirigindo ate a loja) e valida a area de atendimento. Nao use sozinha para responder valor total; para total use montar_resumo_pedido com itens e endereco.',
    schema: z.object({
      enderecoEntrega: z.string().describe('Endereco completo do cliente (rua, numero, bairro)'),
      cepEntrega: z.string().describe('CEP do cliente (obrigatorio) — usado para localizar o endereco com precisao'),
      subtotal: z.number().optional().describe('Subtotal atual do pedido para compor o contexto do atendimento'),
    }),
    func: async ({ enderecoEntrega, cepEntrega, subtotal }) => {
      const subtotalNum = Number(subtotal || 0);

      if (!enderecoEntrega?.trim()) {
        return JSON.stringify({ erro: 'Informe o endereco completo do cliente para calcular o frete.' });
      }
      if (!cepEntrega?.trim()) {
        return JSON.stringify({ erro: 'Informe o CEP do cliente para calcular o frete com precisao.' });
      }

      try {
        const frete = await calcularFreteCardapio({
          enderecoEntrega: enderecoEntrega.trim(),
          cepEntrega: cepEntrega?.trim() || undefined,
        });
        const podeInformarTotal = Boolean(frete.atende && subtotalNum > 0);
        const totalComFrete = podeInformarTotal ? Number((subtotalNum + (frete.frete || 0)).toFixed(2)) : null;

        return JSON.stringify({
          ...frete,
          subtotal: subtotalNum,
          subtotalFormatado: formatBRL(subtotalNum),
          totalComFrete,
          totalComFreteFormatado: totalComFrete === null ? null : formatBRL(totalComFrete),
          podeInformarTotal,
          avisoTotal: podeInformarTotal
            ? 'Total calculado com subtotal + frete.'
            : 'Este resultado e apenas o frete. Nao informe como valor total sem calcular o subtotal dos produtos.',
          avisoHorarioEntrega: ATENDIMENTO_AVISO_HORARIO_ENTREGA,
        });
      } catch (error: any) {
        return JSON.stringify({
          erro: error?.message || 'Nao foi possivel calcular o frete para o endereco informado.',
        });
      }
    },
  });

  const gerarLinkCardapio = new DynamicStructuredTool({
    name: 'gerar_link_cardapio',
    description: 'Gera o link do cardapio digital publico para o cliente fechar pedido.',
    schema: z.object({}),
    func: async () => {
      return JSON.stringify({
        url: ATENDIMENTO_CARDAPIO_URL,
        instrucoes: 'Abra o link, escolha os produtos e finalize o pagamento pelo cardapio digital.',
      });
    },
  });

  const gerarQrCodePixTool = new DynamicStructuredTool({
    name: 'gerar_qr_code_pix',
    description: 'Gera a imagem publica do QR Code a partir de um codigo PIX copia e cola.',
    schema: z.object({
      payloadPix: z.string().describe('Codigo PIX copia e cola'),
      referencia: z.string().describe('Referencia unica do pedido para nomear o QR Code'),
    }),
    func: async ({ payloadPix, referencia }) => {
      if (!payloadPix?.trim()) {
        return JSON.stringify({ erro: 'Codigo PIX obrigatorio para gerar o QR Code.' });
      }

      try {
        const qr = await gerarQrCodePix({
          payload: payloadPix.trim(),
          reference: referencia.trim() || `pix-${Date.now()}`,
        });

        return JSON.stringify({
          sucesso: true,
          qrCodeImageUrl: qr.qrCodeImageUrl,
        });
      } catch (error: any) {
        return JSON.stringify({
          erro: error?.message || 'Nao foi possivel gerar o QR Code do PIX.',
        });
      }
    },
  });

  // Salao: a Linda so registra a reserva; a equipe confirma depois. Nao ha
  // controle de mesas nem comanda digital no sistema.
  const registrarReservaMesa = new DynamicStructuredTool({
    name: 'registrar_reserva_mesa',
    description:
      'Registra uma reserva de mesa no salao. Exige 48h de antecedencia, dia entre segunda e sabado e horario entre 10h e 15h. Use somente depois de ter nome, telefone, quantidade de pessoas e data/hora confirmados pelo cliente.',
    schema: z.object({
      nomeCliente: z.string().describe('Nome de quem vai fazer a reserva'),
      telefone: z.string().describe('Telefone do cliente com DDD'),
      pessoas: z.number().describe('Quantidade de pessoas'),
      dataHora: z
        .string()
        .describe('Data e hora da reserva no formato YYYY-MM-DDTHH:mm (horario de Brasilia)'),
      observacoes: z.string().optional().describe('Observacoes, como aniversario, cadeirao ou pet'),
    }),
    func: async ({ nomeCliente, telefone, pessoas, dataHora, observacoes }) => {
      try {
        const reserva = await criarReserva({
          nomeCliente,
          telefone,
          pessoas,
          dataHora,
          observacoes,
          origem: 'WHATSAPP_IA',
        });
        return JSON.stringify({
          sucesso: true,
          reservaId: reserva.id,
          status: reserva.status,
          mensagemParaCliente: `Reserva anotada para ${pessoas} pessoa(s). Nossa equipe confirma com voce em seguida.`,
        });
      } catch (error: any) {
        // Devolve o motivo em texto para a Linda explicar a regra ao cliente.
        return JSON.stringify({ sucesso: false, erro: error?.message || 'Nao consegui registrar a reserva.' });
      }
    },
  });

  return [
    consultarCatalogoProdutos,
    consultarProdutoDetalhado,
    montarResumoPedido,
    criarPedidoWhatsapp,
    consultarCepTool,
    calcularFrete,
    gerarLinkCardapio,
    gerarQrCodePixTool,
    registrarReservaMesa,
  ];
}

// ===== SYSTEM PROMPTS =====

const SYSTEM_PROMPT_GESTAO = `Você é o assistente de gestão do Barracão, um restaurante com delivery, retirada e salão.
Seu papel Ã© ajudar o gestor/dono a consultar informaÃ§Ãµes do sistema de gestÃ£o de forma rÃ¡pida e prÃ¡tica via WhatsApp.

VocÃª pode:
- Consultar faturamento e receitas por perÃ­odo
- Consultar custos e despesas por perÃ­odo
- Consultar quantidade de vendas/pedidos
- Consultar estoque de produtos (incluindo alertas de estoque baixo)
- Atualizar estoque de produtos (entrada, saÃ­da, ajuste)
- Consultar base de clientes
- Consultar produtos mais vendidos
- Consultar lucro da empresa por período
- Enviar formulário de cadastro de produto
- Cadastrar produto novo no sistema (sem imagem)

Regras:
- Sempre responda em portuguÃªs brasileiro
- Seja direto e objetivo nas respostas
- Formate valores monetÃ¡rios em R$ (ex: R$ 1.500,00)
- Quando o usuÃ¡rio nÃ£o especificar datas, use o mÃªs atual
- Para perguntas numÃ©ricas (faturamento, receita, custos, vendas, estoque), sempre use as tools antes de responder
- Nunca invente nÃºmeros; se faltar dado, diga que nÃ£o encontrou no sistema
- Nunca cite produto por nome sem ter vindo de tool nesta conversa; se nao houver produto retornado pela tool, diga que nao encontrou no estoque
- Para atualizar estoque, sempre confirme o produto e a quantidade antes de executar
- Para cadastrar produto, sempre envie primeiro o formulario e só cadastre depois de receber os campos preenchidos
- Se nÃ£o encontrar dados, informe educadamente
- Mantenha respostas curtas e adequadas para WhatsApp (mÃ¡ximo 400 caracteres por mensagem quando possÃ­vel)
- Hoje Ã©: {DATA_ATUAL}`;

const SYSTEM_PROMPT_ATENDIMENTO = `Voce e a Linda, atendente do Barracao no WhatsApp.
Objetivo: atender rapido e com gentileza, ajudar o cliente a escolher, fechar o pedido e conduzir ate o pagamento.

Dados oficiais da operacao:
- Nome: Barracao
- Endereco: R. Olga Genioli Leite, 50 - Jurubatuba, Sao Paulo - SP, 04675-130
- Tambem estamos no iFood, 99food e Keeta
- Horarios de funcionamento:
  Segunda a sabado: 10:00 ate 15:00
  Domingo: fechado
  Feriados: fechado
  A cozinha abre as 8h, mas so recebemos pedidos a partir das 9h
  As entregas comecam as 11h, em ordem de pedido
- Entrega:
  Faz delivery: sim, com entregador proprio
  Tempo medio: 30 minutos, contando a partir das 11h
  Nao ha pedido minimo
  Raio maximo de entrega: 5km
  Frete por distancia:
    ate 2km = R$ 4,00
    2 a 3km = R$ 5,00
    3 a 4km = R$ 6,00
    4 a 5km = R$ 8,00
  Entrega gratis em pedidos a partir de R$ 200,00
  Endereco acima de 5km: nao recuse na hora. Envie a mensagem do campo mensagemForaDeArea da tool e, se o cliente aceitar, feche o pedido como RETIRADA.
- Retirada no balcao: sim. Preparo medio de 15 minutos. Na retirada o cliente informa o numero do pedido e o nome de quem pediu.
- Salao para consumo no local: sim.
  Aceita reserva de mesa, com no minimo 48h de antecedencia.
  Recebe criancas, tem cadeirao e aceita pets. Tem area externa. Nao tem estacionamento.
  O cardapio do salao e diferente do cardapio do delivery.
  No salao o garcom anota o pedido e a comanda e de papel. A conta pode ser dividida.
- Buffet por quilo: R$ 60,00 o quilo, com churrasco.
- Pagamento:
  Aceita Pix, dinheiro, debito, credito e VR/VA
  Pix preferencialmente pelo QR Code dinamico gerado pelo sistema
  Chave Pix, quando o cliente pedir a chave direto: 11980535427
  Maquininha na entrega: sim

Perguntas frequentes, responda com estas informacoes:
- Tem salmao? Sim, marmita de salmao por R$ 30,00 mais a taxa de entrega.
- Marmita so de salada? Sim, R$ 19,99, com as saladas do buffet do dia.
- Qual a sobremesa? Nao ha sobremesa fixa, depende do que o cozinheiro preparou no dia. Pode ser mousse, gelatina, sorvete ou salada de fruta.
- Que horas comecam as entregas? A partir das 11h, em ordem de pedido.
- Posso agendar meu pedido? Pode. O cliente escolhe o dia e a hora e deixa o valor pago no Pix.

Como voce fala:
- Sempre em portugues brasileiro, tom semi-informal
- Gentil e simples, sem vocabulario complicado
- Use poucos emojis
- Texto simples, sem markdown, sem asteriscos, sem listas com bullet
- Frases curtas, uma pergunta nova por mensagem
- Nunca seja rude, nunca ignore o cliente e nunca repita a mesma coisa varias vezes
- Nunca deixe o cliente sem resposta

Nunca invente:
- Nunca cite produto, preco, sabor ou disponibilidade que nao tenha vindo de uma tool nesta conversa
- Se a tool nao retornou o produto, diga que nao encontrou no estoque
- Nunca invente prazo, taxa ou regra que nao esteja aqui
- Para vitrine ao cliente, so mostre item com estoque disponivel
- Ao apresentar produtos, informe apenas nome, preco e disponibilidade, nunca a quantidade em estoque

Processo comercial para fechar um pedido:
1) Entender o que o cliente quer e a quantidade
2) Confirmar disponibilidade e valor usando as tools
3) Se o item tiver sabor ou variacao, confirmar qual, antes de seguir
4) Perguntar se e ENTREGA ou RETIRADA
5) Coletar o nome do cliente
6) Se for ENTREGA: peca somente o CEP primeiro. Com o CEP use a tool consultar_cep, confirme a rua e o bairro com o cliente e so entao peca o numero e o complemento. Nunca pergunte a distancia em km nem invente o valor do frete: use as tools.
7) Se for RETIRADA: nao peca endereco, apenas confirme o nome
8) Perguntar a forma de pagamento antes de criar o pedido
9) Se for Pix: colete o email do cliente antes de fechar
10) Se for dinheiro: pergunte se precisa de troco e para qual valor
11) Se for cartao ou VR/VA: informe que o pagamento e na entrega ou na retirada
12) Repetir o resumo final: itens, subtotal, frete quando houver, total, forma de entrega e forma de pagamento
13) Com a confirmacao do cliente, usar a tool criar_pedido_whatsapp
14) Informar o numero do pedido e lembrar que as entregas saem a partir das 11h

Uma coisa por vez:
- Nao pergunte nome e tipo de entrega na mesma mensagem
- Nao pergunte endereco e forma de pagamento juntos
- Nao pergunte troco e email juntos
- Avance no maximo um passo por mensagem

Sobre frete e total:
- Nunca informe o frete como se fosse o total do pedido
- O total de uma entrega e sempre subtotal dos produtos mais frete mais acrescimos
- Para responder quanto fica, use a tool montar_resumo_pedido, nunca so o frete
- Se o pedido chegar a R$ 200,00, avise que a entrega saiu de graca

Reserva de mesa:
- Voce pode registrar reserva de mesa. Esse e o unico ponto do salao que voce atende.
- Exige no minimo 48h de antecedencia, de segunda a sabado, entre 10h e 15h
- Colete: nome, telefone, quantidade de pessoas e a data e hora desejadas
- Com tudo confirmado, use a tool registrar_reserva_mesa
- Avise que a reserva fica registrada e a equipe confirma em seguida
- Se a tool recusar, explique o motivo com gentileza e ofereca outra data ou horario
- Voce nao controla mesas, comanda nem conta do salao. Para isso, chame um atendente.

Quando o cliente esta indeciso:
- Fale dos nossos mais vendidos e das promocoes do dia, usando as tools
- Com marmita, vale oferecer as bebidas do cardapio

Quando o cliente pede desconto:
- Voce pode oferecer um cupom de desconto ou entrega gratis para ate 2km
- Nao invente porcentagem: use os cupons que existirem no sistema

Se um item acabar no meio do pedido:
- Avise com transparencia e ofereca uma opcao parecida

Se faltar informacao para o pedido:
- Pergunte ao cliente e siga com o pedido assim que ele responder

Pagamento:
- Sempre valide o comprovante do Pix antes de confirmar
- Antes de confirmar o pagamento, garanta que o cliente nao quer mudar nada
- No pagamento na entrega, peca para o cliente estar disponivel quando o motoboy chegar

Alteracao e cancelamento:
- O cliente pode mudar o pedido, mas apenas antes de efetuar o pagamento
- Pergunte o que ele quer mudar e ajuste antes do pagamento
- Pedido que ja saiu para entrega nao pode ser cancelado

Fora do horario de funcionamento:
- Informe que estamos fechados e diga os nossos horarios
- Ofereca o cardapio do dia seguinte

Cliente agressivo:
- Peca desculpas e avise que vai solicitar a supervisao na conversa
- Com linguagem inadequada, nao entre no assunto

Mensagem repetida ou fora de contexto:
- Avise com educacao que nao conseguiu entender
- Se continuar sem entender, ofereca transferir para um atendente

Reclamacao:
- Peca desculpas pelo ocorrido
- Voce pode oferecer um cupom de desconto antes de chamar um atendente
- Em caso de atraso, use: Pedimos desculpas pelo ocorrido, estamos com uma alta demanda de pedidos.

O que voce pode resolver sozinha:
- Aceitar e registrar pedidos
- Oferecer entrega gratis para ate 2km
- Dar desconto na proxima compra quando o erro foi do restaurante
- Combinar o reenvio de um prato entregue errado
- Registrar reserva de mesa

Quando chamar um atendente humano, obrigatorio:
- Quando o cliente pedir para falar com uma pessoa
- Quando voce nao souber responder
- Em qualquer caso de estorno
- Em ameaca, xingamento ou intimidacao
- Em conflito de entrega ou cliente que nao encontrou o motoboy
- Para qualquer assunto de mesa, comanda ou conta do salao
Frase de transferencia: "Vou te transferir para um atendente que vai te ajudar melhor com isso, tudo bem?"

Limites:
- Se nao souber, diga com transparencia e ofereca encaminhar para um atendente
- Nunca prometa prazo diferente dos 30 minutos, contados a partir das 11h
- Nunca confirme pedido sem os dados essenciais validados

Agora: {DATA_HORA_ATUAL}
Hoje e: {DATA_ATUAL}`;

// ===== FUNÃ‡ÃƒO PRINCIPAL =====

export async function gerarRespostaIA(params: {
  mensagem: string;
  remetente: string;
  tipoAgente: 'GESTAO' | 'ATENDIMENTO';
  instanciaId: string;
}) {
  const { mensagem, remetente, tipoAgente, instanciaId } = params;
  console.log('[ia] gerarRespostaIA.start', { tipoAgente, instanciaId, remetente, mensagemPreview: String(mensagem).slice(0, 120) });

  if (tipoAgente === 'ATENDIMENTO') {
    const respostaPedidoCardapio = await responderConfirmacaoPedidoCardapio(mensagem);
    if (respostaPedidoCardapio) {
      // Cliente chegou pelo deeplink do cardapio para confirmar um pedido ja feito.
      // Consome a saudacao sem enviar: dar boas-vindas no meio de um pedido pago seria fora de contexto.
      await reivindicarSaudacao(instanciaId, remetente).catch(() => false);
      console.log('[ia] resposta_direta_confirmacao_pedido_cardapio', { remetente, instanciaId });
      return { text: respostaPedidoCardapio, usedFallback: false };
    }
  }

  // Primeira mensagem do contato: boas-vindas + oferta de pedido manual, antes de qualquer outro atalho.
  if (tipoAgente === 'ATENDIMENTO' && (await reivindicarSaudacao(instanciaId, remetente))) {
    console.log('[ia] resposta_direta_boas_vindas', { remetente, instanciaId });
    return {
      text: `${ATENDIMENTO_BOAS_VINDAS}\n\n${ATENDIMENTO_OFERTA_PEDIDO_MANUAL}`,
      mensagens: [ATENDIMENTO_BOAS_VINDAS, ATENDIMENTO_OFERTA_PEDIDO_MANUAL],
      // Sinaliza ao webhook que, se o envio falhar, o claim precisa ser devolvido.
      ehSaudacao: true,
      usedFallback: false,
    };
  }

  // "sim" logo apos a oferta de pedido manual: manda o formulario.
  if (tipoAgente === 'ATENDIMENTO' && (await clienteAceitouOfertaPedidoManual(mensagem, instanciaId, remetente))) {
    console.log('[ia] resposta_direta_formulario_pedido_manual', { remetente, instanciaId });
    return {
      text: ATENDIMENTO_FORMULARIO_PEDIDO_MANUAL,
      mensagens: [ATENDIMENTO_FORMULARIO_PEDIDO_MANUAL],
      usedFallback: false,
    };
  }

  if (tipoAgente === 'ATENDIMENTO' && mensagemPedeLinkCardapio(mensagem)) {
    const respostaLink = responderLinkCardapio();
    console.log('[ia] resposta_direta_link_cardapio', { remetente, instanciaId });
    return { text: respostaLink, usedFallback: false };
  }

  // Cliente ja pediu explicitamente: manda so o formulario. Repetir a oferta aqui deixaria a
  // string da oferta na ultima resposta e faria qualquer "ok" seguinte reenviar o formulario.
  if (tipoAgente === 'ATENDIMENTO' && mensagemPedePedidoManual(mensagem)) {
    console.log('[ia] resposta_direta_pedido_manual', { remetente, instanciaId });
    return {
      text: ATENDIMENTO_FORMULARIO_PEDIDO_MANUAL,
      mensagens: [ATENDIMENTO_FORMULARIO_PEDIDO_MANUAL],
      usedFallback: false,
    };
  }

  if (mensagemPedeCatalogoOuDisponibilidade(mensagem)) {
    const respostaDireta = await responderCatalogoSemAlucinacao(mensagem);
    return { text: respostaDireta, usedFallback: false };
  }

  // Buscar chave da OpenAI (primeiro do banco, depois env)
  const configIA = await prisma.configuracaoIA.findFirst();
  const apiKey = configIA?.openaiApiKey || config.openaiApiKey;
  const modelName = configIA?.openaiModel || config.openaiModel || 'gpt-4o-mini';

  if (!apiKey) {
    console.warn('[ia] gerarRespostaIA.sem_api_key');
    return { text: 'Chave da OpenAI nÃ£o configurada. Configure em ConfiguraÃ§Ãµes > Chave OpenAI.', usedFallback: true };
  }

  // Buscar histÃ³rico recente
  const historico = await prisma.mensagemIA.findMany({
    where: { instanciaId, remetente },
    orderBy: { criadoEm: 'desc' },
    take: 10,
  });

  const historicoTexto = historico
    .reverse()
    .map(m => `UsuÃ¡rio: ${m.conteudo}\nAssistente: ${m.resposta || ''}`)
    .join('\n');

  // Montar prompts
  const agora = new Date();
  const dataAtual = agora.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
  const dataHoraAtual = agora.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
  const systemPrompt = tipoAgente === 'GESTAO'
    ? SYSTEM_PROMPT_GESTAO.replace('{DATA_ATUAL}', dataAtual)
    : SYSTEM_PROMPT_ATENDIMENTO
      .replace('{DATA_ATUAL}', dataAtual)
      .replace('{DATA_HORA_ATUAL}', dataHoraAtual);

  const userPrompt = historicoTexto
    ? `HistÃ³rico recente:\n${historicoTexto}\n\nNova mensagem do usuÃ¡rio (${remetente}):\n${mensagem}`
    : `Mensagem do usuÃ¡rio (${remetente}):\n${mensagem}`;

  // Configurar modelo
  const model = new ChatOpenAI({
    apiKey,
    model: modelName,
    temperature: 0.2,
    ...(config.openaiBaseUrl ? { configuration: { baseURL: config.openaiBaseUrl } } : {}),
  });

  // Configurar tools
  const tools: any[] = tipoAgente === 'GESTAO'
    ? criarToolsGestao()
    : criarToolsAtendimento({
        mensagensUsuarioRecentes: [...historico.map((mensagemHistorico) => mensagemHistorico.conteudo), mensagem],
      });

  const toolMap = new Map<string, any>(tools.map(t => [t.name, t]));
  const modelWithTools = model.bindTools(tools);
  console.log('[ia] gerarRespostaIA.tools', { tipoAgente, tools: tools.map((t: any) => t.name) });

  const messages: any[] = [
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ];

  // Loop de tool calling (mÃ¡ximo 4 iteraÃ§Ãµes)
  for (let step = 0; step < 4; step++) {
    console.log('[ia] tool_loop.step.start', { step: step + 1 });
    const aiMessage: any = await modelWithTools.invoke(messages);
    messages.push(aiMessage);

    const toolCalls = Array.isArray(aiMessage.tool_calls) ? aiMessage.tool_calls : [];
    console.log('[ia] tool_loop.step.result', { step: step + 1, toolCalls: toolCalls.length, hasContent: Boolean(aiMessage?.content) });

    if (toolCalls.length === 0) {
      const text = typeof aiMessage.content === 'string' ? aiMessage.content.trim() : '';
      if (!text) {
        console.warn('[ia] tool_loop.no_text_response', { step: step + 1 });
        return { text: 'Desculpe, nÃ£o consegui processar sua mensagem.', usedFallback: true };
      }
      console.log('[ia] gerarRespostaIA.success_without_tools', { step: step + 1, textPreview: text.slice(0, 120) });
      return { text, usedFallback: false };
    }

    for (const call of toolCalls) {
      const toolName = String(call?.name || '');
      const targetTool = toolMap.get(toolName);
      const args = call?.args && typeof call.args === 'object' ? call.args : {};
      console.log('[ia] tool_call.start', { toolName, args });

      let toolResult = '';
      if (!targetTool) {
        toolResult = JSON.stringify({ erro: `Tool nÃ£o encontrada: ${toolName}` });
        console.warn('[ia] tool_call.not_found', { toolName });
      } else {
        try {
          toolResult = await targetTool.invoke(args);
          console.log('[ia] tool_call.success', { toolName, resultPreview: String(toolResult).slice(0, 200) });
        } catch (error: any) {
          toolResult = JSON.stringify({ erro: error?.message || 'Falha na execuÃ§Ã£o da tool' });
          console.error('[ia] tool_call.error', { toolName, error: error?.message || error });
        }
      }

      messages.push(new ToolMessage({
        content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
        tool_call_id: call?.id || `${toolName}-${Date.now()}`,
      }));
    }
  }

  console.warn('[ia] gerarRespostaIA.fallback_max_steps');
  return { text: 'Desculpe, nÃ£o consegui processar sua solicitaÃ§Ã£o no momento.', usedFallback: true };
}


