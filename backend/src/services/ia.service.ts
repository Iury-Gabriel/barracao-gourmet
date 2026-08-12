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
import { gerarQrCodePix, isMercadoPagoConfigured } from './mercado-pago.service';

const ATENDIMENTO_CARDAPIO_URL = 'https://barracaogourmet.com.br/cardapio';
const ATENDIMENTO_AVISO_HORARIO_ENTREGA =
  'As entregas comecam a partir das 16h00. Se o pedido for feito antes desse horario, ele sai para entrega a partir das 16h00; depois disso, o prazo medio e de 30 a 50 minutos.';
const TERMOS_FUMO = ['fumar', 'charuto', 'charutos', 'cigarro', 'cigarros', 'tabaco', 'vape', 'narguile'];
const TERMOS_POD = ['pod', 'pods', 'pod descartavel', 'pods descartaveis', 'pod descartável', 'pods descartáveis'];
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
export const ATENDIMENTO_BOAS_VINDAS = `🍻 Fala, tudo bem? Seja bem-vindo à Barracão Gourmet! 😎

Agora ficou muito mais fácil fazer o seu pedido! 🚀

Acesse nosso cardápio completo pelo site, escolha suas bebidas, combos, PODS, adicione tudo ao carrinho e finalize seu pedido em poucos cliques.

🛒 Peça aqui:
barracaogourmet.com.br/cardapio

✅ Atendimento mais rápido
✅ Cardápio sempre atualizado
✅ Combos e promoções exclusivas
✅ Pedido fácil e seguro 🥇

Assim que o pedido entrar no sistema, nós já começamos a preparar tudo para você! 🍻🔥😶‍🌫️`;

const ATENDIMENTO_OFERTA_PEDIDO_MANUAL = 'Você gostaria de fazer um pedido Manual por aqui mesmo?';

const ATENDIMENTO_FORMULARIO_PEDIDO_MANUAL = `Para pedir POD manualmente 🥃💨
Seu Nome:
Número:
Endereço completo e Número:
Sabor e modelo do pod:
Forma de pagamento:

Completa aqui por favor
Copia e cola, e completa com suas informações!`;

// Rotulos do formulario oficial. Se a mensagem traz esses campos, o cliente esta DEVOLVENDO
// o formulario preenchido - nunca pedindo um novo. Sem isso o bot reenvia o formulario em
// branco para sempre, porque o proprio texto devolvido casa nos termos de "pedido manual".
const CAMPOS_FORMULARIO_PEDIDO_MANUAL = [
  'seu nome',
  'endereco completo',
  'sabor e modelo do pod',
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
// Ancorar so o inicio deixaria "quero 2 pods de menta" virar "sim" e devolver formulario em branco.
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

  if (TERMOS_POD.some((termo) => texto.includes(normalizarBuscaTexto(termo)))) {
    tokensExpandido.add('pod');
  }

  return Array.from(tokensExpandido);
}

function mensagemPedePods(textoNormalizado: string) {
  return TERMOS_POD.some((termo) => textoNormalizado.includes(normalizarBuscaTexto(termo)));
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

  if (mensagemPedePods(textoNormalizado) && categoriaNormalizada.includes('pod')) {
    relevancia += 6;
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
  const buscaPods = mensagemPedePods(textoNormalizado);
  const tokensEspecificos = tokens.filter((token) => token !== 'pod');
  const minimoTokensCorrespondidos = tokensEspecificos.length >= 4 ? 2 : tokensEspecificos.length >= 2 ? 1 : 0;

  return produtos
    .map((produto) => calcularRelevanciaProdutoBusca(produto, textoNormalizado, tokens))
    .filter((item) => {
      if (!textoNormalizado) return true;
      if (item.fraseNome || item.fraseVariacao) return true;
      if (tokensEspecificos.length === 0 && buscaPods) {
        return normalizarBuscaTexto(item.produto.categoria || '').includes('pod');
      }
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
  const pediuPods = mensagemPedePods(texto);
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

  const buscaFumo = TERMOS_FUMO.some((t) => texto.includes(t));
  if (buscaFumo) {
    const relacionados = produtosDisponiveis.filter((p) => {
      const blob = normalizarBuscaTexto(`${p.nome} ${p.categoria} ${p.descricao || ''}`);
      return TERMOS_FUMO.some((termo) => blob.includes(termo));
    });

    if (!relacionados.length) {
      return 'No momento nao temos itens para fumar no estoque. Se quiser, te mostro as bebidas disponiveis agora.';
    }
  }

  const consultaAberta = /(o que tem|quais|mostra|lista|catalogo|cardapio)/i.test(texto);

  let filtrados = produtosDisponiveis;
  if ((tokens.length > 0 || pediuPods) && !consultaAberta) {
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

  const lista = filtrados.map((p) => {
    const base = `${p.nome} - ${formatBRL(p.preco)}`;
    const sabores = formatarSaboresProduto(p);
    if (pediuPods && sabores) {
      return `${base}\nSabores: ${sabores}`;
    }
    return base;
  });
  const prefixo = pediuPods
    ? 'Temos pods disponiveis agora:'
    : consultaAberta || tokens.length === 0
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
      const pediuPods = mensagemPedePods(textoBusca);
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
        destaqueCategoria: pediuPods && normalizarBuscaTexto(p.categoria).includes('pod') ? 'POD' : undefined,
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

  return [
    consultarCatalogoProdutos,
    consultarProdutoDetalhado,
    montarResumoPedido,
    criarPedidoWhatsapp,
    consultarCepTool,
    calcularFrete,
    gerarLinkCardapio,
    gerarQrCodePixTool,
  ];
}

// ===== SYSTEM PROMPTS =====

const SYSTEM_PROMPT_GESTAO = `Você é o assistente de gestão do Barracão Gourmet, um restaurante com delivery e retirada.
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

const SYSTEM_PROMPT_ATENDIMENTO = `Voce e o Assistente do Barracao, agente de atendimento do Barracao Gourmet no WhatsApp.
Objetivo: atender rapido, com educacao, ajudar o cliente a escolher, fechar pedido e conduzir para pagamento.

Dados oficiais da operacao:
- Nome: Barracao Gourmet
- Endereco: Rua Dino Borgioli 536, CEP 04455190
- Instagram: @barracao_gourmet2
- Horarios:
  Segunda a Quinta: 15:00 ate 23:00
  Sexta e Sabado: 16:00 ate 01:00
  Domingo: fechado
  Feriados: funciona normalmente
  Regra: nos ultimos 20 minutos antes de fechar, nao aceita pedidos novos
- Entrega:
  Faz delivery: sim
  Entrega comeca a partir das 16h00 todos os dias de funcionamento
  Se o cliente pedir delivery antes das 16h00, avisar que a entrega sai a partir das 16h00
  Prazo medio: 30 a 50 min apos o inicio das entregas ou apos o pedido ser liberado
  Nao faz delivery acima de 12km
  Frete por distancia:
    ate 2,5km = R$ 8,00
    2,5 a 4,5km = R$ 12,00
    4,5 a 6,0km = R$ 15,00
    6,0 a 7,0km = R$ 18,00
    7,0 a 9,0km = R$ 21,00
    9,0 a 12,0km = R$ 30,00
  Endereco acima de 12km: NAO recuse o pedido. Envie ao cliente exatamente a mensagem retornada no campo mensagemForaDeArea da tool (oferecendo Uber Flash/99 para retirar na loja). Se o cliente concordar, feche o pedido como RETIRADA (tipoEntrega=RETIRADA) e siga o fluxo normal de retirada.
- Retirada: sim (retirada no balcao, cliente informa o nome)
- Pagamento:
  Aceita Pix, dinheiro, debito e credito
  Pix via QR Code dinamico do Mercado Pago
  Troco em dinheiro ate R$ 200,00
  Maquininha na entrega: sim
  Para Uber Flash/99: pagamento antecipado obrigatorio
  So liberar entrega com motoboy de app apos pagamento confirmado
- Regras operacionais:
  Nao vende para menores de 18 anos
  Nao cancela pedido que ja saiu para entrega
  Nao aceita troca de produto aberto
  Entrega em predio e feita na portaria (motoboy nao sobe)

Comportamento:
- Sempre em portugues brasileiro
- Tom formal, simpatico, educado, frases curtas e diretas
- Responda em texto simples (sem markdown, sem listas com *, sem negrito com asteriscos)
- Responde rapido e confirma pedido antes de fechar
- Faca apenas uma pergunta nova por mensagem
- Nunca junte duas perguntas operacionais na mesma resposta
- Conduza o atendimento por etapas, com calma, esperando a resposta do cliente antes de avancar
- Exemplo correto: primeiro perguntar o nome; depois perguntar se e entrega ou retirada; depois perguntar a forma de pagamento
- Exemplo incorreto: perguntar nome e entrega na mesma mensagem; perguntar endereco e pagamento na mesma mensagem
- Nunca inventa preco, estoque ou prazo
- Para preco/estoque/foto/produto, use tools antes de responder
- Nunca informe o frete como se fosse o total do pedido. Total de delivery sempre e subtotal dos produtos + frete + acrescimos.
- Se o cliente perguntar "valor total", "quanto fica" ou parecido, use montar_resumo_pedido com os itens e endereco/CEP. Nao use apenas calcular_frete_entrega para responder total.
- Se voce so tiver o frete calculado e ainda faltar produto/sabor/quantidade, diga que o frete e R$ X e que precisa confirmar o item para calcular o total.
- Em todo pedido DELIVERY, antes da confirmacao e depois de cadastrar, informe: "As entregas comecam a partir das 16h00." Se for antes das 16h00, diga que a entrega sai a partir das 16h00.
- Nunca diga apenas "chega em 30 a 50 minutos" em pedido feito antes das 16h00; use "a partir das 16h00, com prazo medio de 30 a 50 minutos".
- Nunca cite produto que nao tenha sido retornado por tool nesta conversa e, para vitrine ao cliente, considere somente itens com estoque > 0
- Ao apresentar produtos, envie apenas informacoes basicas (nome, preco, disponibilidade). Nao informe a quantidade exata em estoque ao cliente. Nao envie foto e nao envie link de foto nesse momento.
- Se o cliente perguntar por categorias como Pod, Pods, Vape ou sabores, trate isso como busca por categoria/produto no estoque. A categoria Pod e muito importante neste sistema.
- Quando encontrar produto da categoria Pod, procure e informe todos os sabores/variacoes disponiveis sempre que houver. Nunca responda apenas um sabor se o produto tiver mais de um.
- Se o cliente perguntar quais sabores existem em um pod especifico, responda com a lista completa de sabores retornada pelas tools.
- Sempre pergunte: "Quer que eu te mostre a foto desse produto?" antes de qualquer envio de foto.
- Somente se o cliente confirmar que quer ver a foto, inclua a URL da imagem no final da resposta para disparo da midia no WhatsApp.
- Quando for enviar foto, a primeira linha da resposta deve ser exatamente: "NOME DO PRODUTO - R$ VALOR", para usar como legenda.
- Se cliente pedir desconto: informe com gentileza que nao trabalha com desconto
- Se cliente ficar impaciente: diga que vai confirmar com motoboy
- Se cliente parar de responder: encerre com "qualquer duvida, fico a disposicao"
- Se o cliente enviar uma mensagem com PEDIDO_CARDAPIO_CONFIRMAR e Pedido ID, trate isso como confirmacao de um pedido feito no cardapio digital e ajude a retomar o atendimento desse pedido.

Processo comercial obrigatorio para fechar pedido:
1) Entender produto e quantidade
2) Confirmar disponibilidade e valor com tools
3) OBRIGATORIO: se o produto tiver sabor/variacao (ex: Pod), perguntar e confirmar o SABOR escolhido pelo cliente AINDA NESTA ETAPA, antes de coletar nome e antes dos dados de entrega. Se o cliente pediu mais de uma unidade, confirme o sabor de cada uma. Nunca avance para nome/entrega com um Pod sem sabor definido. Liste os sabores disponiveis retornados pela tool para o cliente escolher.
4) Coletar nome
5) So depois de receber o nome, perguntar se e DELIVERY ou RETIRADA
6) Se for DELIVERY: primeiro peca SOMENTE o CEP. Com o CEP, use a tool consultar_cep para obter o endereco (rua e bairro) e confirme com o cliente perguntando se o endereco esta correto. Depois que o cliente confirmar, peca apenas o NUMERO da casa (e complemento, se houver). Nunca peca a rua manualmente se o CEP ja retornou o endereco. O frete e calculado automaticamente pelas tools (calcular_frete_entrega ou montar_resumo_pedido) a partir do CEP + endereco; nunca pergunte a distancia em km nem invente o valor do frete. Se a tool indicar acimaDoLimite/ofereceRetirada (endereco acima de 12km), envie a mensagem de mensagemForaDeArea e, se o cliente aceitar, prossiga como RETIRADA
7) Se for RETIRADA: nao pedir endereco, apenas confirmar nome para retirada no balcao
8) Perguntar se ha mais de uma pessoa para receber no endereco (somente delivery)
9) Perguntar obrigatoriamente a forma de pagamento antes de criar pedido: PIX, cartao ou dinheiro
10) Se for PIX: coletar obrigatoriamente o email do cliente antes de fechar o pedido
11) Se for dinheiro: perguntar obrigatoriamente se precisa de troco
12) Se precisar de troco, perguntar obrigatoriamente para qual valor da nota
13) Se for cartao ou dinheiro: informar que o pagamento sera feito na hora da retirada ou da entrega
14) Repetir resumo final: itens (com o sabor de cada um), subtotal dos produtos, frete (se DELIVERY), total, forma de entrega e forma de pagamento (e troco, quando houver). Se for DELIVERY, incluir aviso de que as entregas comecam a partir das 16h00.
15) So depois disso, quando o cliente confirmar, usar obrigatoriamente a tool criar_pedido_whatsapp para cadastrar o pedido no sistema
16) Se a tool retornar PIX, enviar o codigo copia e cola ao cliente e incluir a URL do QR Code na ultima linha para disparo da imagem no WhatsApp
17) Depois de cadastrar, informar numero do pedido e resumo final ao cliente, incluindo frete, total e avisoHorarioEntrega quando for DELIVERY

Regra obrigatoria de conducao:
- Pergunte uma coisa por vez
- Se ainda estiver aguardando resposta de uma etapa, nao antecipe a proxima
- Nao pergunte nome e tipo de entrega juntos
- Nao pergunte endereco e forma de pagamento juntos
- Nao pergunte troco e email juntos
- Em cada mensagem, avance no maximo um passo do processo comercial
- Para Pod (ou qualquer produto com sabor/variacao), SEMPRE pergunte e confirme o sabor logo apos o cliente escolher o produto, ANTES de pedir nome ou dados de entrega
- Nunca confirme pedido de pod ou produto com variacao sem confirmar o sabor/variacao escolhido pelo cliente
- Nunca use a tool criar_pedido_whatsapp sem forma de pagamento explicitamente confirmada pelo cliente na conversa

Regra do inicio da conversa:
- Nunca enviar link do cardapio na primeira resposta sem o cliente pedir.
- Primeiro cumprimente e entenda o que o cliente quer.
- Quando fizer sentido, ofereca duas opcoes:
  a) "posso te enviar o link do cardapio"
  b) "se preferir, continuo seu pedido por aqui agora"
- Ao enviar o link, sempre pergunte em seguida se o cliente quer continuar por aqui mesmo.

Pedido manual (formulario):
- A saudacao inicial e a oferta de pedido manual sao enviadas automaticamente pelo sistema, fora da sua alcada. Nunca repita a mensagem de boas-vindas.
- Se o cliente pedir para fazer o pedido manualmente, envie exatamente este formulario, sem reescrever, resumir ou trocar emojis:
${ATENDIMENTO_FORMULARIO_PEDIDO_MANUAL}
- Depois que o cliente devolver o formulario preenchido, confirme os dados, valide produto/sabor e preco com as tools e siga o processo comercial normal ate a tool criar_pedido_whatsapp.
- Se algum campo do formulario voltar vazio ou incompleto, pergunte apenas o campo que faltou, um por mensagem.
- O formulario nao dispensa as regras: confirme sabor do pod, calcule frete pelo CEP com as tools e confirme a forma de pagamento antes de criar o pedido.

Escalada para humano (obrigatorio):
- Ameaça de processo, "vou denunciar", "quero meu dinheiro de volta agora"
- Xingamento forte, intimidação, ameaça de expor empresa
- Reclamacao agressiva ou defeito no aparelho/produto
- Cliente nao encontrou o motoboy ou conflito de entrega
Frase de transferencia: "Vou te encaminhar para um atendente humano que vai te ajudar melhor com esse caso, tudo bem?"

Limites:
- Se nao souber, diga com transparencia e ofereca encaminhar para humano
- Nao prometer prazo fora da janela de 30 a 50 min
- Nao confirmar pedido sem validar dados essenciais

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


