import { prisma } from '../lib/prisma';
import { buildBrasiliaDateRange, toBrasiliaDateKey } from '../lib/brasiliaDate';
import {
  encontrarVariacaoPorNome,
  mapearProdutoComEstoqueCalculado,
  produtoControlaEstoquePorVariacao,
} from '../lib/produtoEstoque';
import { enviarMensagem } from './whatsapp.service';
import { validarCupom, registrarUsoCupom } from './cupons.service';
import { clienteTemEntregaGratis } from './clientes.service';

function pagamentoUsaCartao(pagamento?: string, pagamentoEntregaMetodo?: string) {
  if (!pagamento) return false;
  if (pagamento === 'CARTAO_CREDITO' || pagamento === 'CARTAO_DEBITO') return true;
  if (pagamento === 'PAGAR_NA_ENTREGA') {
    return pagamentoEntregaMetodo === 'CARTAO_CREDITO' || pagamentoEntregaMetodo === 'CARTAO_DEBITO';
  }
  return false;
}

async function obterMapaAcrescimoCartaoPorCategoria() {
  const categorias = await prisma.categoriaEstoque.findMany({
    select: { nome: true, acrescimoCartao: true },
  });
  return new Map(categorias.map((categoria) => [categoria.nome, categoria.acrescimoCartao || 0]));
}

async function proximoNumeroPedido(): Promise<number> {
  const contador = await prisma.contador.upsert({
    where: { id: 'pedido_numero' },
    update: { valor: { increment: 1 } },
    create: { id: 'pedido_numero', valor: 1 },
  });
  return contador.valor;
}

function formatarMoedaBRL(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarFormaPagamento(pedido: {
  pagamento?: string | null;
  pagamentoEntregaMetodo?: string | null;
}) {
  const labels: Record<string, string> = {
    PIX: 'PIX',
    CARTAO_CREDITO: 'Cartao de credito',
    CARTAO_DEBITO: 'Cartao de debito',
    DINHEIRO: 'Dinheiro',
    PAGAR_NA_ENTREGA: 'Pagar na entrega',
    PENDENTE: 'Pendente',
  };

  if (pedido.pagamento === 'PAGAR_NA_ENTREGA') {
    const metodo = pedido.pagamentoEntregaMetodo
      ? (labels[pedido.pagamentoEntregaMetodo] || pedido.pagamentoEntregaMetodo)
      : 'Nao informado';

    return `Pagar na entrega (${metodo})`;
  }

  return labels[pedido.pagamento || 'PENDENTE'] || pedido.pagamento || 'Pendente';
}

async function buscarInstanciaWhatsAppConectada() {
  const instanciaAtendimento = await prisma.instanciaWhatsApp.findFirst({
    where: { status: 'CONECTADO', tipo: 'ATENDIMENTO' },
    orderBy: { atualizadoEm: 'desc' },
  });
  if (instanciaAtendimento) return instanciaAtendimento;

  return prisma.instanciaWhatsApp.findFirst({
    where: { status: 'CONECTADO' },
    orderBy: { atualizadoEm: 'desc' },
  });
}

function onlyDigits(value?: string | null) {
  return String(value || '').replace(/\D/g, '');
}

async function resolverTelefonePublicoInstancia(instancia: any) {
  const telefoneAtual = onlyDigits(instancia?.telefone);
  if (telefoneAtual) {
    return telefoneAtual;
  }

  if (instancia?.provedor === 'META_OFICIAL' && instancia?.metaPhoneNumberId && instancia?.metaAccessToken) {
    try {
      const res = await fetch(`https://graph.facebook.com/v22.0/${instancia.metaPhoneNumberId}`, {
        headers: { Authorization: `Bearer ${instancia.metaAccessToken}` },
      });
      const data: any = await res.json().catch(() => ({}));
      const telefoneMeta = onlyDigits(data?.display_phone_number);
      if (telefoneMeta) {
        await prisma.instanciaWhatsApp.update({
          where: { id: instancia.id },
          data: { telefone: telefoneMeta },
        });
        return telefoneMeta;
      }
    } catch (error) {
      console.error('[pedidos] Falha ao resolver telefone publico da instancia Meta', {
        instanciaId: instancia.id,
        error,
      });
    }
  }

  return '';
}

export async function obterContatoWhatsAppAtendimento() {
  const instancia = await buscarInstanciaWhatsAppConectada();
  if (!instancia) return null;

  const telefone = await resolverTelefonePublicoInstancia(instancia);
  if (!telefone) return null;

  return {
    instanciaId: instancia.id,
    telefone,
    url: `https://wa.me/${telefone}`,
  };
}

function formatarStatusPedido(status: string) {
  const labels: Record<string, string> = {
    RECEBIDO: 'recebido',
    EM_PREPARO: 'em preparo',
    PRONTO: 'pronto',
    EM_ENTREGA: 'em entrega',
    ENTREGUE: 'entregue',
    CANCELADO: 'cancelado',
  };
  return labels[status] || status.toLowerCase();
}

function montarMensagemStatusCliente(pedido: any, status: string) {
  const total = formatarMoedaBRL(Number(pedido.total || 0));
  const tipoEntrega = pedido.tipo === 'RETIRADA' ? 'retirada' : 'entrega';

  const porStatus: Record<string, string> = {
    RECEBIDO: `Seu pedido #${pedido.numero} foi recebido com sucesso. Total: ${total}. Ja vamos seguir com o atendimento.`,
    EM_PREPARO: `Seu pedido #${pedido.numero} agora esta em preparo. Assim que houver novidade, eu te aviso por aqui.`,
    PRONTO: pedido.tipo === 'RETIRADA'
      ? `Seu pedido #${pedido.numero} esta pronto para retirada. Quando vier buscar, me avise por aqui.`
      : `Seu pedido #${pedido.numero} esta pronto e aguardando a saida para entrega.`,
    EM_ENTREGA: pedido.tipo === 'RETIRADA'
      ? `Seu pedido #${pedido.numero} esta aguardando retirada no balcao.`
      : `Seu pedido #${pedido.numero} saiu para ${tipoEntrega}. Daqui a pouco chega ate voce.`,
    ENTREGUE: pedido.tipo === 'RETIRADA'
      ? `Seu pedido #${pedido.numero} foi retirado com sucesso. Obrigado pela preferencia!`
      : `Seu pedido #${pedido.numero} foi entregue. Obrigado pela preferencia!`,
    CANCELADO: `Seu pedido #${pedido.numero} foi cancelado. Se precisar, posso te ajudar a montar um novo pedido.`,
  };

  return porStatus[status] || `Seu pedido #${pedido.numero} mudou de status para ${formatarStatusPedido(status)}.`;
}

async function notificarClientePedido(pedido: any, mensagem: string) {
  const telefoneCliente = onlyDigits(pedido?.telefoneCliente || pedido?.cliente?.telefone);
  if (!telefoneCliente) return false;

  const contato = await obterContatoWhatsAppAtendimento();
  if (!contato?.instanciaId) return false;

  return enviarMensagem(contato.instanciaId, telefoneCliente, mensagem);
}

export async function notificarClienteStatusPedido(pedido: any, status: string) {
  try {
    const enviado = await notificarClientePedido(pedido, montarMensagemStatusCliente(pedido, status));
    if (!enviado) {
      console.warn('[pedidos] Nao foi possivel notificar cliente sobre status do pedido', {
        pedidoId: pedido.id,
        status,
      });
    }
  } catch (error) {
    console.error('[pedidos] Falha ao enviar notificacao de status ao cliente', {
      pedidoId: pedido.id,
      status,
      error,
    });
  }
}

export async function marcarPedidoComoPago(id: string, metodoPagamento?: string, origem = 'sistema') {
  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: { cliente: true, itens: { include: { produto: true } }, historico: { orderBy: { criadoEm: 'asc' } } },
  });
  if (!pedido) throw { status: 404, message: 'Pedido não encontrado.' };

  const acabouDeConfirmar = pedido.statusPagamento !== 'PAGO';
  const statusNovo = pedido.status === 'RECEBIDO' ? 'EM_PREPARO' : pedido.status;
  const historicoCreate = [];

  if (acabouDeConfirmar) {
    historicoCreate.push({
      status: pedido.status,
      obs: `Pagamento confirmado via ${origem}${metodoPagamento ? ` (${metodoPagamento})` : ''}`.trim(),
    });
  }

  if (acabouDeConfirmar && statusNovo !== pedido.status) {
    historicoCreate.push({
      status: statusNovo,
      obs: 'Pedido movido automaticamente para preparo apos confirmacao do pagamento.',
    });
  }

  const pedidoAtualizado = await prisma.pedido.update({
    where: { id },
    data: {
      pagamento: metodoPagamento || pedido.pagamento,
      statusPagamento: 'PAGO',
      status: statusNovo,
      historico: historicoCreate.length > 0 ? { create: historicoCreate } : undefined,
    },
    include: { itens: { include: { produto: true } }, cliente: true, historico: { orderBy: { criadoEm: 'asc' } } },
  });

  if (acabouDeConfirmar) {
    try {
      const mensagemPagamento = statusNovo === 'EM_PREPARO'
        ? `Pagamento do pedido #${pedidoAtualizado.numero} recebido com sucesso. Seu pedido ja esta em preparo.`
        : `Pagamento do pedido #${pedidoAtualizado.numero} recebido com sucesso.`;
      await notificarClientePedido(pedidoAtualizado, mensagemPagamento);
    } catch (error) {
      console.error('[pedidos] Falha ao notificar cliente sobre pagamento confirmado', {
        pedidoId: pedidoAtualizado.id,
        error,
      });
    }
  }

  return pedidoAtualizado;
}

async function selecionarEntregadorRodizio() {
  const entregadores = await prisma.entregador.findMany({
    orderBy: [{ nome: 'asc' }, { criadoEm: 'asc' }],
  });

  if (entregadores.length === 0) return null;

  const contador = await prisma.contador.upsert({
    where: { id: 'entregador_rodizio' },
    update: { valor: { increment: 1 } },
    create: { id: 'entregador_rodizio', valor: 1 },
  });

  const indice = (contador.valor - 1) % entregadores.length;
  return entregadores[indice];
}

function montarMensagemEntrega(pedido: any, entregador: { nome: string; numero: string }) {
  const nomeCliente = pedido.cliente?.nome || pedido.nomeCliente || 'Nao informado';
  const telefoneCliente = pedido.telefoneCliente || pedido.cliente?.telefone || 'Nao informado';
  const endereco = pedido.enderecoEntrega || pedido.cliente?.endereco || 'Nao informado';
  const cep = pedido.cepEntrega || pedido.cliente?.cep || 'Nao informado';
  const pagamento = formatarFormaPagamento(pedido);
  const itensResumo = (pedido.itens || [])
    .map((item: any) => `${item.quantidade}x ${item.produto?.nome || 'Item'}`)
    .join(', ');

  return [
    'Novo pedido para entrega',
    '',
    `Entregador: ${entregador.nome}`,
    `Pedido: #${pedido.numero}`,
    `Cliente: ${nomeCliente}`,
    `Telefone: ${telefoneCliente}`,
    `Endereco: ${endereco}`,
    `CEP: ${cep}`,
    `Total: ${formatarMoedaBRL(pedido.total)}`,
    `Pagamento: ${pagamento}`,
    `Itens: ${itensResumo || 'Nao informado'}`,
  ].join('\n');
}

async function dispararWhatsappEntrega(pedido: any) {
  const entregador = await selecionarEntregadorRodizio();
  if (!entregador) {
    const obs = 'Sem entregadores cadastrados para notificacao de entrega.';
    console.warn(`[pedidos] ${obs}`);
    await prisma.historicoPedido.create({
      data: {
        pedidoId: pedido.id,
        status: pedido.status,
        obs,
      },
    });
    return;
  }

  const instancia = await buscarInstanciaWhatsAppConectada();
  if (!instancia) {
    const obs = 'Sem instancia WhatsApp conectada para notificacao de entrega.';
    console.warn(`[pedidos] ${obs}`);
    await prisma.historicoPedido.create({
      data: {
        pedidoId: pedido.id,
        status: pedido.status,
        obs,
      },
    });
    return;
  }

  const mensagem = montarMensagemEntrega(pedido, entregador);
  const enviado = await enviarMensagem(instancia.id, entregador.numero, mensagem);

  const observacaoEnvio = enviado
    ? `Notificacao enviada para entregador ${entregador.nome} (${entregador.numero}).`
    : `Falha ao enviar notificacao para ${entregador.nome} (${entregador.numero}).`;

  await prisma.historicoPedido.create({
    data: {
      pedidoId: pedido.id,
      status: pedido.status,
      obs: observacaoEnvio,
    },
  });
}

export async function listarPedidos(filtros: {
  status?: string;
  origem?: string;
  dataInicio?: string;
  dataFim?: string;
  clienteId?: string;
  page?: number;
  limit?: number;
}) {
  const { status, origem, dataInicio, dataFim, clienteId, page = 1, limit = 50 } = filtros;
  const where: any = {};
  if (status) where.status = status;
  if (origem) where.origem = origem;
  if (clienteId) where.clienteId = clienteId;
  const periodoBrasilia = buildBrasiliaDateRange(dataInicio, dataFim);
  if (periodoBrasilia) {
    where.criadoEm = periodoBrasilia;
  }

  const [pedidos, total] = await Promise.all([
    prisma.pedido.findMany({
      where,
      include: {
        cliente: { select: { id: true, nome: true, telefone: true } },
        itens: { include: { produto: { select: { id: true, nome: true, imagemUrl: true } } } },
        historico: { orderBy: { criadoEm: 'asc' } },
      },
      orderBy: { criadoEm: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.pedido.count({ where }),
  ]);

  return { pedidos, total, page, limit };
}

export async function buscarPedido(id: string) {
  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: {
      cliente: true,
      itens: { include: { produto: true } },
      historico: { orderBy: { criadoEm: 'asc' } },
    },
  });
  if (!pedido) throw { status: 404, message: 'Pedido não encontrado.' };
  return pedido;
}

// Usado pelo agente local de impressao (app Electron na loja) para saber quais
// pedidos ainda nao foram impressos no cupom fiscal/termico.
export async function listarPedidosParaImprimir() {
  return prisma.pedido.findMany({
    where: { impresso: false },
    include: {
      cliente: { select: { nome: true, telefone: true } },
      itens: { include: { produto: { select: { nome: true } } } },
    },
    orderBy: { criadoEm: 'asc' },
    take: 50,
  });
}

export async function marcarPedidoComoImpresso(id: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id } });
  if (!pedido) throw { status: 404, message: 'Pedido não encontrado.' };
  return prisma.pedido.update({ where: { id }, data: { impresso: true } });
}

export async function criarPedido(data: {
  clienteId?: string;
  nomeCliente?: string;
  telefoneCliente?: string;
  cepEntrega?: string;
  enderecoEntrega?: string;
  frete?: number;
  tipo: string;
  criarComoEntregue?: boolean;
  pagamento?: string;
  pagamentoEntregaMetodo?: string;
  observacoes?: string;
  cupomCodigo?: string;
  itens: { produtoId: string; quantidade: number; variacaoNome?: string }[];
}) {
  const produtosIds = data.itens.map((i) => i.produtoId);
  const [produtos, mapaAcrescimo] = await Promise.all([
    prisma.produto.findMany({
      where: { id: { in: produtosIds } },
      include: { variacoes: { select: { id: true, nome: true, estoque: true, estoqueMinimo: true } } },
    }),
    obterMapaAcrescimoCartaoPorCategoria(),
  ]);

  let total = 0;
  let acrescimoCartaoTotal = 0;
  const itensComPreco = data.itens.map((item) => {
    const produtoBase = produtos.find((p) => p.id === item.produtoId);
    const produto = produtoBase ? mapearProdutoComEstoqueCalculado(produtoBase) : null;
    if (!produto) throw { status: 400, message: `Produto ${item.produtoId} nao encontrado.` };
    if (produto.estoque < item.quantidade) throw { status: 400, message: `Estoque insuficiente para "${produto.nome}".` };
    const variacaoNome = item.variacaoNome?.trim();
    const variacoesProduto = Array.isArray(produto.variacoes) ? produto.variacoes : [];
    const produtoExigeVariacao = Boolean(produto.tipoVariacao?.trim()) || variacoesProduto.length > 0;
    if (produtoExigeVariacao && !variacaoNome) {
      throw {
        status: 400,
        message: `Escolha o ${produto.tipoVariacao?.trim() || 'sabor'} de "${produto.nome}" antes de criar o pedido.`,
      };
    }
    if (variacaoNome) {
      const variacaoEncontrada = encontrarVariacaoPorNome(produto, variacaoNome);
      if (!variacaoEncontrada) throw { status: 400, message: `Variacao "${variacaoNome}" nao encontrada para "${produto.nome}".` };
      if (produtoControlaEstoquePorVariacao(produto) && Number(variacaoEncontrada.estoque || 0) < item.quantidade) {
        throw {
          status: 400,
          message: `Estoque insuficiente para o sabor "${variacaoEncontrada.nome}" de "${produto.nome}".`,
        };
      }
    }
    const subtotal = produto.preco * item.quantidade;
    total += subtotal;
    acrescimoCartaoTotal += (mapaAcrescimo.get(produto.categoria) || 0) * item.quantidade;
    return {
      produtoId: item.produtoId,
      variacaoNome: variacaoNome || null,
      quantidade: item.quantidade,
      precoUnit: produto.preco,
      subtotal,
    };
  });

  let nomeCliente = data.nomeCliente?.trim();
  if (data.clienteId && !nomeCliente) {
    const cliente = await prisma.cliente.findUnique({ where: { id: data.clienteId } });
    nomeCliente = cliente?.nome?.trim();
  }
  nomeCliente = nomeCliente || 'Desconhecido';

  const telefoneCliente = data.telefoneCliente?.trim() || undefined;
  const cepEntrega = data.cepEntrega?.trim() || undefined;
  const enderecoEntrega = data.enderecoEntrega?.trim() || undefined;

  let cupomAplicado: { id: string; codigo: string } | null = null;
  let descontoCupom = 0;
  if (data.cupomCodigo?.trim()) {
    const resultadoCupom = await validarCupom({
      codigo: data.cupomCodigo,
      subtotal: total,
      telefoneCliente,
      formaPagamento: data.pagamento,
      tipoPedido: data.tipo,
    });
    if (!resultadoCupom.valido) {
      throw { status: 400, message: resultadoCupom.motivo };
    }
    cupomAplicado = { id: resultadoCupom.cupom.id, codigo: resultadoCupom.cupom.codigo };
    descontoCupom = resultadoCupom.valorDesconto;
  }

  const adicionalCartao = pagamentoUsaCartao(data.pagamento, data.pagamentoEntregaMetodo)
    ? acrescimoCartaoTotal
    : 0;
  // Cliente com isencao de frete no cadastro nao paga entrega, mesmo que o
  // operador digite um valor de frete na tela de novo pedido.
  const entregaGratis =
    data.tipo === 'DELIVERY' &&
    (await clienteTemEntregaGratis({ clienteId: data.clienteId, telefone: telefoneCliente }));
  const frete = data.tipo === 'DELIVERY' && !entregaGratis ? Number(data.frete || 0) : 0;
  const totalFinal = Math.max(0, Number((total + adicionalCartao + frete - descontoCupom).toFixed(2)));
  const statusInicial = data.criarComoEntregue ? 'ENTREGUE' : 'RECEBIDO';
  const observacaoHistoricoInicial = data.criarComoEntregue
    ? 'Pedido criado manualmente e marcado como entregue'
    : 'Pedido criado manualmente';

  const numero = await proximoNumeroPedido();
  const pedido = await prisma.pedido.create({
    data: {
      numero,
      clienteId: data.clienteId,
      nomeCliente,
      telefoneCliente,
      cepEntrega,
      enderecoEntrega,
      tipo: data.tipo,
      pagamento: data.pagamento || 'PENDENTE',
      pagamentoEntregaMetodo: data.pagamentoEntregaMetodo,
      status: statusInicial,
      origem: 'MANUAL',
      total: totalFinal,
      cupomId: cupomAplicado?.id,
      cupomCodigo: cupomAplicado?.codigo,
      descontoCupom,
      observacoes:
        [data.observacoes || '', entregaGratis ? 'Frete: GRATIS (cliente com entrega gratis)' : frete > 0 ? `Frete: R$ ${frete.toFixed(2)}` : '', adicionalCartao > 0 ? `Acrescimo cartao: R$ ${adicionalCartao.toFixed(2)}` : '']
          .filter(Boolean)
          .join(' | ') || undefined,
      itens: { create: itensComPreco },
      historico: { create: { status: statusInicial, obs: observacaoHistoricoInicial } },
    },
    include: { itens: { include: { produto: true } }, cliente: true, historico: { orderBy: { criadoEm: 'asc' } } },
  });

  if (cupomAplicado) {
    await registrarUsoCupom(cupomAplicado.id);
  }

  // Baixar estoque
  for (const item of itensComPreco) {
    const produto = produtos.find((entry) => entry.id === item.produtoId);
    if (produtoControlaEstoquePorVariacao(produto) && item.variacaoNome) {
      const variacao = encontrarVariacaoPorNome(produto, item.variacaoNome);
      await prisma.$transaction([
        prisma.produtoVariacao.update({
          where: { id: variacao.id },
          data: { estoque: { decrement: item.quantidade } },
        }),
        prisma.produto.update({
          where: { id: item.produtoId },
          data: { estoque: { decrement: item.quantidade } },
        }),
      ]);
    } else {
      await prisma.produto.update({
        where: { id: item.produtoId },
        data: { estoque: { decrement: item.quantidade } },
      });
    }
    await prisma.movimentacaoEstoque.create({
      data: {
        produtoId: item.produtoId,
        variacaoNome: item.variacaoNome || undefined,
        tipo: 'SAIDA',
        quantidade: item.quantidade,
        motivo: `Pedido #${pedido.numero} - Manual`,
      },
    });
  }

  // Registrar interacao no cliente
  if (data.clienteId) {
    await prisma.interacaoCliente.create({
      data: {
        clienteId: data.clienteId,
        tipo: 'PEDIDO',
        descricao: data.criarComoEntregue
          ? `Pedido #${pedido.numero} criado como entregue - R$ ${totalFinal.toFixed(2)}`
          : `Pedido #${pedido.numero} criado - R$ ${totalFinal.toFixed(2)}`,
      },
    });
  }

  if (data.criarComoEntregue) {
    await prisma.lancamentoFinanceiro.create({
      data: {
        tipo: 'RECEITA',
        categoria: 'Venda',
        descricao: `Pedido #${pedido.numero}`,
        valor: pedido.total,
        data: new Date(),
        pedidoId: pedido.id,
      },
    });
  }

  return pedido;
}
export async function atualizarStatus(id: string, status: string, obs?: string) {
  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: { cliente: true, itens: { include: { produto: true } } },
  });
  if (!pedido) throw { status: 404, message: 'Pedido não encontrado.' };

  const statusValidos = ['RECEBIDO', 'EM_PREPARO', 'PRONTO', 'EM_ENTREGA', 'ENTREGUE', 'CANCELADO'];
  if (!statusValidos.includes(status)) throw { status: 400, message: 'Status inválido.' };
  if (pedido.tipo === 'RETIRADA' && status === 'EM_ENTREGA') {
    throw {
      status: 400,
      message: 'Pedido de retirada não pode ir para "Para entrega". Quando o cliente buscar, marque como "Entregue".',
    };
  }

  const pedidoAtualizado = await prisma.pedido.update({
    where: { id },
    data: {
      status,
      historico: { create: { status, obs: obs || `Status atualizado para ${status}` } },
    },
    include: { itens: { include: { produto: true } }, cliente: true, historico: { orderBy: { criadoEm: 'asc' } } },
  });

  const transicaoParaEntrega = pedido.tipo === 'DELIVERY' && pedido.status === 'PRONTO' && status === 'EM_ENTREGA';
  if (transicaoParaEntrega) {
    try {
      await dispararWhatsappEntrega(pedidoAtualizado);
    } catch (error) {
      console.error('[pedidos] Falha ao notificar entregador no WhatsApp:', error);
    }
  }

  // Ao entregar, registrar receita financeira
  if (status === 'ENTREGUE') {
    await prisma.lancamentoFinanceiro.create({
      data: {
        tipo: 'RECEITA',
        categoria: 'Venda',
        descricao: `Pedido #${pedido.numero}`,
        valor: pedido.total,
        data: new Date(),
        pedidoId: id,
      },
    });
    // Registrar interação no cliente
    if (pedido.clienteId) {
      await prisma.interacaoCliente.create({
        data: {
          clienteId: pedido.clienteId,
          tipo: 'PEDIDO',
          descricao: `Pedido #${pedido.numero} entregue — R$ ${pedido.total.toFixed(2)}`,
        },
      });
    }
  }

  // Ao cancelar, devolver estoque
  if (status === 'CANCELADO' && pedido.status !== 'CANCELADO') {
    const itens = await prisma.itemPedido.findMany({
      where: { pedidoId: id },
      include: {
        produto: {
          include: {
            variacoes: {
              select: { id: true, nome: true, estoque: true, estoqueMinimo: true },
            },
          },
        },
      },
    });
    for (const item of itens) {
      if (produtoControlaEstoquePorVariacao(item.produto) && item.variacaoNome) {
        const variacao = encontrarVariacaoPorNome(item.produto, item.variacaoNome);
        await prisma.$transaction([
          prisma.produtoVariacao.update({
            where: { id: variacao.id },
            data: { estoque: { increment: item.quantidade } },
          }),
          prisma.produto.update({
            where: { id: item.produtoId },
            data: { estoque: { increment: item.quantidade } },
          }),
        ]);
      } else {
        await prisma.produto.update({
          where: { id: item.produtoId },
          data: { estoque: { increment: item.quantidade } },
        });
      }
      await prisma.movimentacaoEstoque.create({
        data: {
          produtoId: item.produtoId,
          variacaoNome: item.variacaoNome || undefined,
          tipo: 'ENTRADA',
          quantidade: item.quantidade,
          motivo: `Devolucao - Pedido #${pedido.numero} cancelado`,
        },
      });
    }
  }

  if (pedido.status !== status) {
    await notificarClienteStatusPedido(pedidoAtualizado, status);
  }

  return pedidoAtualizado;
}

export async function atualizarPagamento(id: string, pagamento: string, statusPagamento: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id } });
  if (!pedido) throw { status: 404, message: 'Pedido não encontrado.' };

  if (statusPagamento === 'PAGO') {
    return marcarPedidoComoPago(id, pagamento, 'operacao manual');
  }

  return prisma.pedido.update({
    where: { id },
    data: { pagamento, statusPagamento },
    include: { itens: { include: { produto: true } }, cliente: true, historico: { orderBy: { criadoEm: 'asc' } } },
  });
}

export async function cancelarPedido(id: string) {
  return atualizarStatus(id, 'CANCELADO', 'Pedido cancelado');
}

export async function removerPedido(id: string) {
  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: {
      itens: {
        include: {
          produto: {
            include: {
              variacoes: {
                select: { id: true, nome: true, estoque: true, estoqueMinimo: true },
              },
            },
          },
        },
      },
    },
  });

  if (!pedido) throw { status: 404, message: 'Pedido nao encontrado.' };

  await prisma.$transaction(async (tx) => {
    if (pedido.status !== 'CANCELADO') {
      for (const item of pedido.itens) {
        if (produtoControlaEstoquePorVariacao(item.produto) && item.variacaoNome) {
          const variacao = encontrarVariacaoPorNome(item.produto, item.variacaoNome);
          await tx.produtoVariacao.update({
            where: { id: variacao.id },
            data: { estoque: { increment: item.quantidade } },
          });
        }

        await tx.produto.update({
          where: { id: item.produtoId },
          data: { estoque: { increment: item.quantidade } },
        });
      }
    }

    await tx.lancamentoFinanceiro.deleteMany({
      where: { pedidoId: pedido.id },
    });

    if (pedido.clienteId) {
      await tx.interacaoCliente.deleteMany({
        where: {
          clienteId: pedido.clienteId,
          descricao: { contains: `Pedido #${pedido.numero}` },
        },
      });
    }

    await tx.movimentacaoEstoque.deleteMany({
      where: {
        motivo: { contains: `Pedido #${pedido.numero}` },
      },
    });

    await tx.pedido.delete({
      where: { id: pedido.id },
    });
  });

  return { success: true };
}

export async function kpisPedidos(dataInicio?: string, dataFim?: string) {
  const where: any = {};
  const periodoBrasilia = buildBrasiliaDateRange(dataInicio, dataFim);
  if (periodoBrasilia) {
    where.criadoEm = periodoBrasilia;
  }

  const pedidos = await prisma.pedido.findMany({
    where,
    include: { historico: { orderBy: { criadoEm: 'asc' } } },
  });

  const entregues = pedidos.filter(p => p.status === 'ENTREGUE');
  const cancelados = pedidos.filter(p => p.status === 'CANCELADO');
  const ativos = pedidos.filter(p => !['ENTREGUE', 'CANCELADO'].includes(p.status));

  // Tempo médio de atendimento (recebido → entregue) em minutos
  let tempoTotal = 0;
  let tempoCount = 0;
  for (const p of entregues) {
    const recebido = p.historico.find(h => h.status === 'RECEBIDO');
    const entregue = p.historico.find(h => h.status === 'ENTREGUE');
    if (recebido && entregue) {
      const diff = (new Date(entregue.criadoEm).getTime() - new Date(recebido.criadoEm).getTime()) / 60000;
      tempoTotal += diff;
      tempoCount++;
    }
  }
  const tempoMedioAtendimento = tempoCount > 0 ? Math.round(tempoTotal / tempoCount) : 0;

  // Volume por origem
  const porOrigem: Record<string, number> = {};
  for (const p of pedidos) {
    porOrigem[p.origem] = (porOrigem[p.origem] || 0) + 1;
  }

  // Volume por dia (últimos 30 dias)
  const porDia: Record<string, number> = {};
  for (const p of pedidos) {
    const dia = toBrasiliaDateKey(p.criadoEm);
    porDia[dia] = (porDia[dia] || 0) + 1;
  }
  const graficoDiario = Object.entries(porDia).map(([data, total]) => ({ data, total })).sort((a, b) => a.data.localeCompare(b.data));

  const receita = entregues.reduce((s, p) => s + p.total, 0);
  const ticketMedio = entregues.length > 0 ? receita / entregues.length : 0;
  const taxaCancelamento = pedidos.length > 0 ? (cancelados.length / pedidos.length) * 100 : 0;

  const porPagamento: Record<string, number> = {};
  const porPagamentoEntrega: Record<string, number> = {};
  for (const p of pedidos) {
    const metodo = p.pagamento === 'PAGAR_NA_ENTREGA'
      ? 'PAGAR_NA_ENTREGA'
      : p.pagamento || 'PENDENTE';
    porPagamento[metodo] = (porPagamento[metodo] || 0) + 1;
    if (p.pagamento === 'PAGAR_NA_ENTREGA' && p.pagamentoEntregaMetodo) {
      porPagamentoEntrega[p.pagamentoEntregaMetodo] = (porPagamentoEntrega[p.pagamentoEntregaMetodo] || 0) + 1;
    }
  }

  return {
    total: pedidos.length,
    entregues: entregues.length,
    cancelados: cancelados.length,
    ativos: ativos.length,
    receita,
    ticketMedio,
    taxaCancelamento,
    tempoMedioAtendimento,
    porOrigem,
    graficoDiario,
    porPagamento,
    porPagamentoEntrega,
  };
}

