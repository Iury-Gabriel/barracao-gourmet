import { prisma } from '../lib/prisma';
import {
  COORDENADAS_BASE_LOJA,
  LIMITE_KM_ENTREGA,
  calcularDistanciaHaversineKm,
  calcularDistanciaRotaKm,
  calcularFretePorDistanciaKm,
  consultarCep,
  consultarCepCoordenadas,
  geocodificarEndereco,
} from '../lib/frete';
import {
  calcularEstoqueTotalVariacoes,
  encontrarVariacaoPorNome,
  mapearProdutoComEstoqueCalculado,
  produtoControlaEstoquePorVariacao,
} from '../lib/produtoEstoque';
import {
  buscarCustomerMercadoPago,
  buscarOuCriarCustomerMercadoPago,
  consultarCobrancaMercadoPago,
  criarCobrancaPixMercadoPago,
  criarPagamentoCartaoMercadoPago,
  isMercadoPagoConfigured,
  listarCartoesCustomerMercadoPago,
  mensagemRecusaCartao,
  salvarCartaoNoCustomer,
} from './mercado-pago.service';
import { marcarPedidoComoPago, obterContatoWhatsAppAtendimento } from './pedidos.service';
import { clienteTemEntregaGratis } from './clientes.service';
import { obterConfiguracaoLoja } from './loja.service';
import { validarCupom, registrarUsoCupom } from './cupons.service';

// Remove espacos (inclusive internos) do e-mail. Corretores de teclado no celular
// costumam inserir espaco depois de "." (ex: "nome. sobrenome@gmail. com"), o que
// faz o Mercado Pago recusar o e-mail como invalido e o pagamento falhar sem
// explicacao clara para o cliente.
function sanitizeEmail(email?: string | null) {
  let email2 = String(email || '').trim().replace(/\s+/g, '');
  // Corrige typos comuns e inequivocos de TLD (nenhum destes existe de verdade,
  // entao e seguro corrigir sem risco de "consertar" um dominio valido por engano).
  email2 = email2.replace(/\.(con|comm)$/i, '.com');
  return email2;
}

function pagamentoUsaCartao(pagamento?: string, pagamentoEntregaMetodo?: string) {
  if (!pagamento) return false;
  if (pagamento === 'CARTAO_CREDITO' || pagamento === 'CARTAO_DEBITO') return true;
  if (pagamento === 'PAGAR_NA_ENTREGA') {
    return pagamentoEntregaMetodo === 'CARTAO_CREDITO' || pagamentoEntregaMetodo === 'CARTAO_DEBITO';
  }
  return false;
}

function normalizarTextoComparacao(texto?: string | null) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

async function obterMapaAcrescimoCartaoPorCategoria() {
  const categorias = await prisma.categoriaEstoque.findMany({
    select: { nome: true, acrescimoCartao: true },
  });
  return new Map(categorias.map((categoria) => [categoria.nome, categoria.acrescimoCartao || 0]));
}

async function montarWhatsappAtendimentoPublico() {
  const contato = await obterContatoWhatsAppAtendimento();
  if (!contato) return null;

  return {
    telefone: contato.telefone,
    url: contato.url,
  };
}

function montarMercadoPagoDoPedido(pedido: any) {
  if (!pedido?.mercadoPagoOrderId) return null;

  return {
    order_id: pedido.mercadoPagoOrderId,
    payment_id: pedido.mercadoPagoPaymentId || null,
    status: pedido.mercadoPagoStatus || null,
    status_detail: pedido.mercadoPagoStatusDetail || null,
    pix: {
      payload: pedido.mercadoPagoQrCode || null,
      qrCodeImageUrl: pedido.mercadoPagoQrCodeImageUrl || null,
      expirationDate: pedido.mercadoPagoExpirationDate || null,
      ticketUrl: pedido.mercadoPagoTicketUrl || null,
    },
  };
}

async function sincronizarPagamentoPixMercadoPago(pedido: any) {
  if (!pedido?.mercadoPagoOrderId || pedido.pagamento !== 'PIX') {
    return pedido;
  }

  try {
    const mercadoPago = await consultarCobrancaMercadoPago(pedido.mercadoPagoOrderId);
    const pagamentoConfirmado =
      mercadoPago.status === 'processed' &&
      mercadoPago.statusDetail === 'accredited';

    if (pagamentoConfirmado && pedido.statusPagamento !== 'PAGO') {
      await marcarPedidoComoPago(pedido.id, 'PIX', 'consulta automatica do cardapio');
    }

    return prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        mercadoPagoPaymentId: mercadoPago.paymentId || undefined,
        mercadoPagoStatus: mercadoPago.status || undefined,
        mercadoPagoStatusDetail: mercadoPago.statusDetail || undefined,
        mercadoPagoQrCode: mercadoPago.pix?.payload || undefined,
        mercadoPagoQrCodeImageUrl: mercadoPago.pix?.qrCodeImageUrl || undefined,
        mercadoPagoTicketUrl: mercadoPago.pix?.ticketUrl || undefined,
        mercadoPagoExpirationDate: mercadoPago.pix?.expirationDate || undefined,
      },
      include: {
        itens: { include: { produto: true } },
        historico: { orderBy: { criadoEm: 'asc' } },
      },
    });
  } catch (error) {
    console.error('[mercado-pago] Falha ao sincronizar pagamento PIX do pedido', {
      pedidoId: pedido.id,
      mercadoPagoOrderId: pedido.mercadoPagoOrderId,
      error,
    });
    return pedido;
  }
}

async function proximoNumeroPedido(): Promise<number> {
  const contador = await prisma.contador.upsert({
    where: { id: 'pedido_numero' },
    update: { valor: { increment: 1 } },
    create: { id: 'pedido_numero', valor: 1 },
  });
  return contador.valor;
}

async function ordenarProdutosPorPedidos(produtos: any[]) {
  const agregados = await prisma.itemPedido.groupBy({
    by: ['produtoId'],
    _sum: { quantidade: true },
  });
  const ranking = new Map(agregados.map((item) => [item.produtoId, item._sum.quantidade ?? 0]));

  return produtos
    .map((produto) => ({ ...produto, qtdPedidos: ranking.get(produto.id) ?? 0 }))
    .sort((a, b) => b.qtdPedidos - a.qtdPedidos || a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome));
}

// Raio (km, em linha reta) ao redor da loja para limitar o geocode.
// Cobre folgadamente a area de entrega (max 12km de rota) e exclui outras cidades/estados.
const RAIO_BUSCA_GEOCODE_KM = 20;

// Acima desta distancia (linha reta) a coordenada do CEP e considerada suspeita/furada
// (a AwesomeAPI as vezes erra). Nesse caso validamos geocodificando a rua oficial.
// Igual ao limite real de entrega (linha reta e sempre <= rota dirigida): qualquer CEP
// que a AwesomeAPI coloque perto ou alem da fronteira de atendimento e conferido via
// geocode antes de aceitar/recusar o pedido — evita tanto falso "fora de area" quanto
// falso "dentro da area" por coordenada errada.
const LIMITE_SANIDADE_CEP_KM = LIMITE_KM_ENTREGA;

// Busca coordenadas do CEP com cache no banco: cada CEP bate na API externa só uma vez.
async function obterCepCoordenadasCacheado(cepLimpo: string) {
  const cacheado = await prisma.cepCoordenada.findUnique({ where: { cep: cepLimpo } }).catch(() => null);
  if (cacheado) {
    console.log('[cep] cache HIT', { cep: cepLimpo, lat: cacheado.lat, lon: cacheado.lon });
    return {
      logradouro: cacheado.logradouro,
      bairro: cacheado.bairro,
      cidade: cacheado.cidade,
      uf: cacheado.uf,
      lat: cacheado.lat,
      lon: cacheado.lon,
    };
  }

  const dados = await consultarCepCoordenadas(cepLimpo);
  if (dados?.lat != null && dados?.lon != null) {
    await prisma.cepCoordenada.create({
      data: {
        cep: cepLimpo,
        logradouro: dados.logradouro,
        bairro: dados.bairro,
        cidade: dados.cidade,
        uf: dados.uf,
        lat: dados.lat,
        lon: dados.lon,
      },
    }).catch((err) => console.warn('[cep] falha ao gravar cache', { cep: cepLimpo, err: err?.message }));
  }
  return dados;
}

async function calcularFreteAutomatico(enderecoEntrega: string, cepEntrega?: string) {
  const cepLimpo = String(cepEntrega || '').replace(/\D/g, '');
  const limparBairro = (b?: string) => String(b || '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
  // IMPORTANTE: o numero da casa NAO entra no calculo do frete (so e salvo no endereco do pedido).
  // Removemos numeros do texto para evitar que o geocoder varie o resultado conforme o numero.
  const removerNumero = (s?: string) =>
    String(s || '').replace(/\d+/g, ' ').replace(/\s*,\s*,/g, ',').replace(/\s{2,}/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '').trim();

  let destinoGeo: { lat: number; lon: number; displayName: string } | null = null;
  let origemConsulta: 'cep-coords' | 'cep-geocode' | 'texto' = 'texto';

  // Camadas "grossas" (centro de cidade/regiao) NAO servem para calcular frete — geram distancia errada.
  const camadasImprecisas = ['locality', 'localadmin', 'region', 'macroregion', 'macrocounty', 'county', 'country'];
  const geocodeUtil = (geo: { layer?: string } | null) => geo && !camadasImprecisas.includes(String(geo.layer || ''));

  const origem = { lat: COORDENADAS_BASE_LOJA.lat, lon: COORDENADAS_BASE_LOJA.lon };

  if (cepLimpo.length === 8) {
    const cepCoord = await obterCepCoordenadasCacheado(cepLimpo);
    const consultaOficial = cepCoord && (cepCoord.logradouro || cepCoord.bairro)
      ? [
          cepCoord.logradouro,
          limparBairro(cepCoord.bairro),
          cepCoord.cidade || 'São Paulo',
          cepCoord.uf || 'SP',
          'Brasil',
        ].filter(Boolean).join(', ')
      : null;
    const displayNameCep = cepCoord
      ? [cepCoord.logradouro, limparBairro(cepCoord.bairro), cepCoord.cidade, cepCoord.uf].filter(Boolean).join(', ')
      : '';

    // 1) Coordenada do CEP (AwesomeAPI). Validamos a sanidade: se vier longe demais da loja,
    //    a coordenada provavelmente esta furada (a AwesomeAPI as vezes erra), entao geocodificamos a rua.
    if (cepCoord?.lat != null && cepCoord?.lon != null) {
      const distRetaKm = calcularDistanciaHaversineKm(origem, { lat: cepCoord.lat, lon: cepCoord.lon });
      if (distRetaKm <= LIMITE_SANIDADE_CEP_KM) {
        destinoGeo = { lat: cepCoord.lat, lon: cepCoord.lon, displayName: displayNameCep };
        origemConsulta = 'cep-coords';
      } else {
        console.warn('[frete] coord do CEP suspeita (longe demais da loja), validando via geocode da rua', {
          cep: cepLimpo,
          distRetaKm: Number(distRetaKm.toFixed(1)),
          coord: { lat: cepCoord.lat, lon: cepCoord.lon },
        });
        if (consultaOficial) {
          const geo = await geocodificarEndereco(consultaOficial, {
            focusLat: COORDENADAS_BASE_LOJA.lat,
            focusLon: COORDENADAS_BASE_LOJA.lon,
            radiusKm: RAIO_BUSCA_GEOCODE_KM,
          });
          if (geocodeUtil(geo)) {
            destinoGeo = geo;
            origemConsulta = 'cep-geocode';
          }
        }
        // Se o geocode nao ajudou, usa a coord distante mesmo (provavelmente fora da area = nao atende).
        // Nao manda alerta critico (Pushover) aqui: na pratica esse aviso costuma ser falso positivo
        // (a rua realmente fica longe, o geocode so nao teve confianca suficiente pra confirmar) e
        // virou ruido. Fica so registrado no log pra investigar se precisar.
        if (!destinoGeo) {
          console.warn('[frete] coordenada do CEP nao confirmada pelo geocode da rua, usando mesmo assim', {
            cep: cepLimpo,
            enderecoEntrega,
            distRetaKm: Number(distRetaKm.toFixed(1)),
            coord: { lat: cepCoord.lat, lon: cepCoord.lon },
          });
          destinoGeo = { lat: cepCoord.lat, lon: cepCoord.lon, displayName: displayNameCep };
          origemConsulta = 'cep-coords';
        }
      }
    } else {
      // 2) CEP sem coordenadas: pega o endereco oficial (BrasilAPI/ViaCEP) e geocodifica (sem numero).
      const dadosCep = cepCoord || await consultarCep(cepLimpo);
      if (dadosCep && (dadosCep.logradouro || dadosCep.bairro)) {
        const consulta = [
          dadosCep.logradouro,
          limparBairro(dadosCep.bairro),
          dadosCep.cidade || 'São Paulo',
          dadosCep.uf || 'SP',
          'Brasil',
        ].filter(Boolean).join(', ');
        const geo = await geocodificarEndereco(consulta, {
          focusLat: COORDENADAS_BASE_LOJA.lat,
          focusLon: COORDENADAS_BASE_LOJA.lon,
          radiusKm: RAIO_BUSCA_GEOCODE_KM,
        });
        if (geocodeUtil(geo)) {
          destinoGeo = geo;
          origemConsulta = 'cep-geocode';
        } else if (geo) {
          console.warn('[frete] geocode impreciso (centroide), descartando', { layer: geo.layer, consulta });
        }
      }
    }
  }

  // 3) Fallback final: sem CEP util, usa o texto livre (SEM numero) com "Sao Paulo, SP" fixo.
  if (!destinoGeo) {
    const enderecoDestino = removerNumero(enderecoEntrega);
    if (!enderecoDestino) {
      throw { status: 400, message: 'Informe o endereco e o CEP para calcular o frete.' };
    }
    const geo = await geocodificarEndereco(`${enderecoDestino}, São Paulo, SP, Brasil`, {
      focusLat: COORDENADAS_BASE_LOJA.lat,
      focusLon: COORDENADAS_BASE_LOJA.lon,
      radiusKm: RAIO_BUSCA_GEOCODE_KM,
    });
    if (geocodeUtil(geo)) {
      destinoGeo = geo;
      origemConsulta = 'texto';
    } else if (geo) {
      console.warn('[frete] geocode impreciso no fallback de texto, descartando', { layer: geo.layer });
    }
  }

  console.log('[frete] iniciando calculo', {
    enderecoEntrega,
    cepEntrega: cepEntrega || null,
    origemConsulta,
    destino: destinoGeo,
    raioBuscaKm: RAIO_BUSCA_GEOCODE_KM,
  });

  if (!destinoGeo) {
    console.warn('[frete] Endereco do cliente sem localizacao', {
      enderecoInformado: enderecoEntrega,
      cepInformado: cepEntrega || null,
    });
    throw { status: 400, message: 'Nao foi possivel localizar seu endereco com precisao agora. Confira o CEP e tente novamente em instantes.' };
  }

  const destino = { lat: destinoGeo.lat, lon: destinoGeo.lon };

  // Distancia real de rota dirigindo (OpenRouteService). Em caso de falha, cai para haversine.
  const rota = await calcularDistanciaRotaKm(origem, destino);
  const distanciaKm = rota?.distanciaKm ?? calcularDistanciaHaversineKm(origem, destino);
  if (!rota) {
    console.warn('[frete] Rota indisponivel, usando distancia haversine como fallback', {
      destino: destinoGeo,
      distanciaHaversineKm: distanciaKm,
    });
  }

  const distanciaArredondada = Number(distanciaKm.toFixed(2));
  const freteInfo = calcularFretePorDistanciaKm(distanciaArredondada);

  console.log('[frete] Calculo concluido', {
    enderecoDestinoNormalizado: destinoGeo.displayName,
    distanciaKm: distanciaArredondada,
    metodoDistancia: rota ? 'rota-driving-car' : 'haversine-fallback',
    atende: freteInfo.atende,
    frete: freteInfo.frete,
  });

  return {
    ...freteInfo,
    distanciaKm: distanciaArredondada,
    enderecoDestinoNormalizado: destinoGeo.displayName,
  };
}

function prepararProdutoCardapio(produto: any, ocultarVariacoesSemEstoque = false) {
  return mapearProdutoComEstoqueCalculado(
    produto,
    {
      ocultarVariacoesSemEstoque,
      recalcularDisponibilidade: true,
    },
  );
}

export async function listarProdutosCardapio() {
  const [produtos, mapaAcrescimo] = await Promise.all([
    prisma.produto.findMany({
      where: { disponivel: true },
      orderBy: [{ categoria: 'asc' }, { nome: 'asc' }],
      select: {
        id: true,
        nome: true,
        descricao: true,
        categoria: true,
        tipoVariacao: true,
        controlaEstoquePorVariacao: true,
        preco: true,
        imagemUrl: true,
        disponivel: true,
        estoque: true,
        variacoes: {
          select: {
            id: true,
            nome: true,
            descricao: true,
            ordem: true,
            estoque: true,
            estoqueMinimo: true,
          },
          orderBy: { ordem: 'asc' },
        },
      },
    }),
    obterMapaAcrescimoCartaoPorCategoria(),
  ]);
  return ordenarProdutosPorPedidos(
    produtos
      .map((produto) => prepararProdutoCardapio(produto, true))
      .filter((produto) => produto.disponivel && produto.estoque > 0)
      .map((produto) => ({
        ...produto,
        acrescimoCartaoCategoria: mapaAcrescimo.get(produto.categoria) || 0,
      })),
  );
}

export async function listarTodosProdutosCardapio() {
  const [produtos, mapaAcrescimo] = await Promise.all([
    prisma.produto.findMany({
      orderBy: [{ categoria: 'asc' }, { nome: 'asc' }],
      select: {
        id: true,
        nome: true,
        descricao: true,
        categoria: true,
        tipoVariacao: true,
        controlaEstoquePorVariacao: true,
        preco: true,
        imagemUrl: true,
        disponivel: true,
        estoque: true,
        variacoes: {
          select: {
            id: true,
            nome: true,
            descricao: true,
            ordem: true,
            estoque: true,
            estoqueMinimo: true,
          },
          orderBy: { ordem: 'asc' },
        },
      },
    }),
    obterMapaAcrescimoCartaoPorCategoria(),
  ]);
  return ordenarProdutosPorPedidos(
    produtos.map((produto) => ({
      ...prepararProdutoCardapio(produto, false),
      acrescimoCartaoCategoria: mapaAcrescimo.get(produto.categoria) || 0,
    })),
  );
}

// Categorias com capa cadastrada, para o cardapio publico usar como imagem principal.
export async function listarCategoriasCardapio() {
  const categorias = await prisma.categoriaEstoque.findMany({
    where: { imagemUrl: { not: null } },
    select: { nome: true, imagemUrl: true },
  });
  return categorias.map((categoria) => ({ nome: categoria.nome, imagemUrl: categoria.imagemUrl }));
}

export async function criarPedidoCardapio(data: {
  nomeCliente: string;
  telefoneCliente: string;
  emailCliente?: string;
  documentoCliente?: string;
  cepEntrega?: string;
  enderecoEntrega?: string;
  tipo: string;
  pagamento?: string;
  pagamentoEntregaMetodo?: string;
  precisaTroco?: boolean;
  valorTrocoPara?: number;
  observacoes?: string;
  ipCliente?: string;
  // Cartao online (Checkout Transparente): token gerado no navegador.
  cartaoToken?: string;
  cartaoTokenSalvar?: string; // token separado para salvar o cartao
  cartaoPaymentMethodId?: string;
  cartaoIssuerId?: string;
  cartaoDocType?: string;
  cartaoDocNumber?: string;
  cartaoEmail?: string;
  cartaoSalvar?: boolean; // salvar cartao para proximas compras
  cartaoSalvoId?: string; // pagamento usando um cartao ja salvo
  cupomCodigo?: string;
  itens: { produtoId: string; quantidade: number; variacaoNome?: string }[];
}) {
  data.emailCliente = sanitizeEmail(data.emailCliente);
  data.cartaoEmail = sanitizeEmail(data.cartaoEmail);

  const configLoja = await obterConfiguracaoLoja();
  if (configLoja.lojaFechada) {
    throw { status: 400, message: configLoja.mensagemFechado || 'A loja está fechada no momento. Tente novamente mais tarde.' };
  }

  const produtosIds = data.itens.map((i) => i.produtoId);
  const [produtos, mapaAcrescimo] = await Promise.all([
    prisma.produto.findMany({
      where: { id: { in: produtosIds } },
      select: {
        id: true,
        nome: true,
        categoria: true,
        tipoVariacao: true,
        controlaEstoquePorVariacao: true,
        preco: true,
        estoque: true,
        disponivel: true,
        variacoes: {
          select: {
            id: true,
            nome: true,
            estoque: true,
            estoqueMinimo: true,
          },
        },
      },
    }),
    obterMapaAcrescimoCartaoPorCategoria(),
  ]);

  let total = 0;
  let acrescimoCartaoTotal = 0;
  const itensComPreco = data.itens.map((item) => {
    const produtoBase = produtos.find((p) => p.id === item.produtoId);
    const produto = produtoBase ? prepararProdutoCardapio(produtoBase, false) : null;
    if (!produto) throw { status: 400, message: `Produto ${item.produtoId} nao encontrado.` };
    if (!produto.disponivel) throw { status: 400, message: `Produto "${produto.nome}" nao esta disponivel.` };
    if (produto.estoque < item.quantidade) throw { status: 400, message: `Estoque insuficiente para "${produto.nome}".` };
    const variacoesProduto = Array.isArray(produto.variacoes) ? produto.variacoes : [];
    const produtoExigeVariacao = Boolean(produto.tipoVariacao?.trim()) || variacoesProduto.length > 0;
    const variacaoNomeInformada = item.variacaoNome?.trim();

    if (produtoExigeVariacao && !variacaoNomeInformada) {
      throw {
        status: 400,
        message: `Escolha o ${produto.tipoVariacao?.trim() || 'sabor'} de "${produto.nome}" antes de fechar o pedido.`,
      };
    }

    let variacaoNome: string | null = null;
    if (variacaoNomeInformada) {
      const variacaoEncontrada = encontrarVariacaoPorNome(produto, variacaoNomeInformada);
      if (!variacaoEncontrada) {
        throw {
          status: 400,
          message: `Variacao "${variacaoNomeInformada}" nao encontrada para "${produto.nome}".`,
        };
      }
      if (produtoControlaEstoquePorVariacao(produto) && Number(variacaoEncontrada.estoque || 0) < item.quantidade) {
        throw {
          status: 400,
          message: `Estoque insuficiente para o sabor "${variacaoEncontrada.nome}" de "${produto.nome}".`,
        };
      }
      variacaoNome = variacaoEncontrada.nome;
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

  let clienteId: string | undefined;
  if (data.telefoneCliente) {
    let cliente = await prisma.cliente.findFirst({ where: { telefone: data.telefoneCliente } });
    if (!cliente) {
      cliente = await prisma.cliente.create({
        data: {
          nome: data.nomeCliente,
          telefone: data.telefoneCliente,
          email: data.emailCliente?.trim() || undefined,
          cep: data.cepEntrega,
          endereco: data.enderecoEntrega,
        },
      });
    } else if (
      cliente.nome !== data.nomeCliente ||
      cliente.email !== (data.emailCliente?.trim() || null) ||
      cliente.cep !== (data.cepEntrega || null) ||
      cliente.endereco !== (data.enderecoEntrega || null)
    ) {
      cliente = await prisma.cliente.update({
        where: { id: cliente.id },
        data: {
          nome: data.nomeCliente,
          email: data.emailCliente?.trim() || undefined,
          cep: data.cepEntrega,
          endereco: data.enderecoEntrega,
        },
      });
    }
    clienteId = cliente.id;
  }

  let cupomAplicado: { id: string; codigo: string } | null = null;
  let descontoCupom = 0;
  if (data.cupomCodigo?.trim()) {
    const resultadoCupom = await validarCupom({
      codigo: data.cupomCodigo,
      subtotal: total,
      telefoneCliente: data.telefoneCliente,
      formaPagamento: data.pagamento,
      tipoPedido: data.tipo,
    });
    if (!resultadoCupom.valido) {
      throw { status: 400, message: resultadoCupom.motivo };
    }
    cupomAplicado = { id: resultadoCupom.cupom.id, codigo: resultadoCupom.cupom.codigo };
    descontoCupom = resultadoCupom.valorDesconto;
  }

  const freteInfo =
    data.tipo === 'DELIVERY'
      ? await calcularFreteAutomatico(data.enderecoEntrega || '', data.cepEntrega)
      : { atende: true, frete: 0, distanciaKm: 0, enderecoDestinoNormalizado: '' };

  if (!freteInfo.atende) {
    const motivo = 'motivo' in freteInfo ? freteInfo.motivo : undefined;
    throw { status: 400, message: motivo || 'Endereco fora da area de entrega.' };
  }

  // Cliente com isencao de frete no cadastro nao paga entrega.
  const entregaGratis =
    data.tipo === 'DELIVERY' &&
    (await clienteTemEntregaGratis({
      clienteId,
      telefone: data.telefoneCliente,
      email: data.emailCliente,
    }));
  const valorFrete = entregaGratis ? 0 : freteInfo.frete || 0;

  const pagamento = data.pagamento || 'PENDENTE';
  const aplicaAcrescimoCartao = pagamentoUsaCartao(data.pagamento, data.pagamentoEntregaMetodo);
  const adicionalCartao = aplicaAcrescimoCartao ? acrescimoCartaoTotal : 0;
  const totalComFrete = Math.max(
    0,
    Number((total + valorFrete + adicionalCartao - descontoCupom).toFixed(2)),
  );
  const numero = await proximoNumeroPedido();

  let mercadoPagoCheckout: any = null;
  let cartaoPagamento: { paymentId: string; status: string; statusDetail?: string } | null = null;

  if (pagamento === 'CARTAO_CREDITO') {
    // Cartao online (pagar agora): cobra via Mercado Pago com o token do navegador.
    if (!isMercadoPagoConfigured()) {
      throw { status: 500, message: 'Integracao Mercado Pago nao configurada. Defina MERCADO_PAGO_ACCESS_TOKEN.' };
    }
    if (!data.cartaoToken) {
      throw { status: 400, message: 'Dados do cartao ausentes. Preencha o cartao para pagar online.' };
    }
    const emailPagador = String(data.emailCliente || data.cartaoEmail || '').trim();
    if (!emailPagador) {
      throw { status: 400, message: 'Email do cliente obrigatorio para pagar com cartao online.' };
    }
    // Se for pra salvar o cartao (ou usar um salvo), associamos a um customer do MP.
    let customerId: string | undefined;
    if (data.cartaoSalvar || data.cartaoSalvoId) {
      customerId = (await buscarOuCriarCustomerMercadoPago(emailPagador, data.nomeCliente)) || undefined;
    }
    // Salva o cartao no customer (token separado). Best-effort: nao bloqueia o pagamento.
    if (customerId && data.cartaoSalvar && data.cartaoTokenSalvar) {
      await salvarCartaoNoCustomer(customerId, data.cartaoTokenSalvar).catch(() => null);
    }
    const pg = await criarPagamentoCartaoMercadoPago({
      token: data.cartaoToken,
      paymentMethodId: data.cartaoPaymentMethodId || '',
      issuerId: data.cartaoIssuerId,
      installments: 1, // somente a vista
      transactionAmount: totalComFrete,
      descricao: `Pedido #${numero} via cardapio digital`,
      payerEmail: emailPagador,
      payerNome: data.nomeCliente,
      payerDocType: data.cartaoDocType,
      payerDocNumber: data.cartaoDocNumber,
      customerId,
      externalReference: `pedido-${numero}`,
    });
    if (pg.status !== 'approved') {
      // Nao cria o pedido se o pagamento nao foi aprovado.
      throw { status: 400, message: mensagemRecusaCartao(pg.status, pg.statusDetail) };
    }
    cartaoPagamento = pg;
  }

  if (pagamento === 'PIX') {
    if (!isMercadoPagoConfigured()) {
      throw {
        status: 500,
        message: 'Integracao Mercado Pago nao configurada. Defina MERCADO_PAGO_ACCESS_TOKEN.',
      };
    }
    if (!String(data.emailCliente || '').trim()) {
      throw {
        status: 400,
        message: 'Email do cliente obrigatorio para gerar o PIX.',
      };
    }

    mercadoPagoCheckout = await criarCobrancaPixMercadoPago({
      nomeCliente: data.nomeCliente,
      telefoneCliente: data.telefoneCliente,
      emailCliente: String(data.emailCliente || '').trim(),
      documentoCliente: data.documentoCliente,
      cepEntrega: data.cepEntrega,
      enderecoEntrega: data.enderecoEntrega,
      total: totalComFrete,
      descricao: `Pedido #${numero} via cardapio digital`,
      externalReference: `pedido-${numero}`,
    });
  }

  const observacoesBase = data.observacoes?.trim() || '';
  const infoFrete =
    data.tipo === 'DELIVERY'
      ? entregaGratis
        ? `Frete: GRATIS (cliente com entrega gratis) - ${Number(freteInfo.distanciaKm || 0).toFixed(2)} km.`
        : `Frete: R$ ${valorFrete.toFixed(2)} (${Number(freteInfo.distanciaKm || 0).toFixed(2)} km).`
      : '';
  const infoTroco =
    data.pagamento === 'PAGAR_NA_ENTREGA' && data.pagamentoEntregaMetodo === 'DINHEIRO'
      ? data.precisaTroco
        ? data.valorTrocoPara && data.valorTrocoPara > 0
          ? `Troco: sim (levar para R$ ${data.valorTrocoPara.toFixed(2)}).`
          : 'Troco: sim.'
        : 'Troco: nao.'
      : '';
  const infoCartao =
    adicionalCartao > 0 ? `Acrescimo cartao: R$ ${adicionalCartao.toFixed(2)}.` : '';
  const infoMercadoPago = mercadoPagoCheckout
    ? `Mercado Pago order_id=${mercadoPagoCheckout.orderId}; payment_id=${mercadoPagoCheckout.paymentId}.`
    : '';
  const observacoesFinal = [observacoesBase, infoFrete, infoTroco, infoCartao, infoMercadoPago].filter(Boolean).join(' | ') || undefined;

  const pedido = await prisma.pedido.create({
    data: {
      numero,
      clienteId,
      nomeCliente: data.nomeCliente,
      telefoneCliente: data.telefoneCliente,
      cepEntrega: data.cepEntrega,
      enderecoEntrega: data.enderecoEntrega,
      tipo: data.tipo,
      pagamento,
      pagamentoEntregaMetodo: data.pagamentoEntregaMetodo,
      statusPagamento: cartaoPagamento ? 'PAGO' : 'AGUARDANDO',
      status: 'RECEBIDO',
      origem: 'CARDAPIO_DIGITAL',
      mercadoPagoOrderId: mercadoPagoCheckout?.orderId,
      mercadoPagoPaymentId: mercadoPagoCheckout?.paymentId || cartaoPagamento?.paymentId,
      mercadoPagoStatus: mercadoPagoCheckout?.status || cartaoPagamento?.status,
      mercadoPagoStatusDetail: mercadoPagoCheckout?.statusDetail || cartaoPagamento?.statusDetail,
      mercadoPagoQrCode: mercadoPagoCheckout?.pix?.payload,
      mercadoPagoQrCodeImageUrl: mercadoPagoCheckout?.pix?.qrCodeImageUrl,
      mercadoPagoTicketUrl: mercadoPagoCheckout?.pix?.ticketUrl,
      mercadoPagoExpirationDate: mercadoPagoCheckout?.pix?.expirationDate,
      total: totalComFrete,
      cupomId: cupomAplicado?.id,
      cupomCodigo: cupomAplicado?.codigo,
      descontoCupom,
      observacoes: observacoesFinal,
      itens: { create: itensComPreco },
      historico: { create: { status: 'RECEBIDO', obs: 'Pedido recebido pelo cardapio digital' } },
    },
    include: { itens: { include: { produto: true } } },
  });

  if (cupomAplicado) {
    await registrarUsoCupom(cupomAplicado.id);
  }

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
        motivo: `Pedido #${pedido.numero} - Cardapio Digital`,
      },
    });
  }

  if (clienteId) {
    await prisma.interacaoCliente.create({
      data: {
        clienteId,
        tipo: 'PEDIDO',
        descricao: `Pedido #${pedido.numero} via cardapio digital - R$ ${totalComFrete.toFixed(2)}`,
      },
    });
  }

  const whatsappAtendimento = await montarWhatsappAtendimentoPublico();

  return {
    ...pedido,
    financeiro: {
      subtotalProdutos: Number(total.toFixed(2)),
      frete: Number(valorFrete.toFixed(2)),
      entregaGratis,
      acrescimoCartao: Number(adicionalCartao.toFixed(2)),
      desconto: descontoCupom,
      cupomCodigo: cupomAplicado?.codigo,
      total: totalComFrete,
    },
    mercadoPago: mercadoPagoCheckout
      ? {
          order_id: mercadoPagoCheckout.orderId,
          payment_id: mercadoPagoCheckout.paymentId,
          status: mercadoPagoCheckout.status,
          status_detail: mercadoPagoCheckout.statusDetail,
          payment: mercadoPagoCheckout.rawResponse,
          pix: mercadoPagoCheckout.pix,
        }
      : montarMercadoPagoDoPedido(pedido),
    whatsappAtendimento,
  };
}

export async function calcularFreteCardapio(data: {
  enderecoEntrega: string;
  cepEntrega?: string;
  telefoneCliente?: string;
  emailCliente?: string;
}) {
  const freteInfo = await calcularFreteAutomatico(data.enderecoEntrega, data.cepEntrega);
  const entregaGratis =
    freteInfo.atende &&
    (await clienteTemEntregaGratis({ telefone: data.telefoneCliente, email: data.emailCliente }));

  if (!entregaGratis) return { ...freteInfo, entregaGratis: false };
  return { ...freteInfo, frete: 0, entregaGratis: true };
}

function soDigitos(s?: string) {
  return String(s || '').replace(/\D/g, '');
}

// Autofill: busca os dados do cliente (de pedidos anteriores) por telefone ou email.
export async function buscarClienteCardapio(params: { telefone?: string; email?: string }) {
  const tel = soDigitos(params.telefone);
  const email = String(params.email || '').trim().toLowerCase();

  const or: any[] = [];
  if (tel.length >= 8) or.push({ telefone: { contains: tel.slice(-8) } });
  if (email) or.push({ email: { equals: email, mode: 'insensitive' } });
  if (or.length === 0) return null;

  const cliente = await prisma.cliente.findFirst({
    where: { OR: or },
    orderBy: { criadoEm: 'desc' },
    select: { nome: true, telefone: true, email: true, cep: true, endereco: true, bairro: true },
  });

  return cliente;
}

// Lista os cartoes salvos do cliente (Mercado Pago), identificando por email ou telefone.
export async function listarCartoesSalvosCliente(params: { telefone?: string; email?: string }) {
  let email = sanitizeEmail(params.email).toLowerCase();
  if (!email) {
    const tel = soDigitos(params.telefone);
    if (tel.length >= 8) {
      const cliente = await prisma.cliente.findFirst({
        where: { telefone: { contains: tel.slice(-8) } },
        orderBy: { criadoEm: 'desc' },
        select: { email: true },
      });
      email = String(cliente?.email || '').trim().toLowerCase();
    }
  }
  if (!email) return { cards: [] as any[] };

  const customerId = await buscarCustomerMercadoPago(email);
  if (!customerId) return { cards: [] as any[] };

  const cards = await listarCartoesCustomerMercadoPago(customerId);
  return { cards };
}

// "Meus pedidos": lista pedidos do cliente por telefone ou email, com status e itens.
export async function listarPedidosCardapioCliente(params: { telefone?: string; email?: string }) {
  const tel = soDigitos(params.telefone);
  const email = String(params.email || '').trim().toLowerCase();

  // Acha os clientes que batem com o email informado (para incluir pedidos por clienteId).
  const orCliente: any[] = [];
  if (tel.length >= 8) orCliente.push({ telefone: { contains: tel.slice(-8) } });
  if (email) orCliente.push({ email: { equals: email, mode: 'insensitive' } });
  const clienteIds = orCliente.length
    ? (await prisma.cliente.findMany({ where: { OR: orCliente }, select: { id: true } })).map((c) => c.id)
    : [];

  const orPedido: any[] = [];
  if (tel.length >= 8) orPedido.push({ telefoneCliente: { contains: tel.slice(-8) } });
  if (clienteIds.length) orPedido.push({ clienteId: { in: clienteIds } });
  if (orPedido.length === 0) return [];

  const pedidos = await prisma.pedido.findMany({
    where: { OR: orPedido },
    orderBy: { criadoEm: 'desc' },
    take: 30,
    include: { itens: { include: { produto: { select: { nome: true } } } } },
  });

  return pedidos.map((p) => ({
    id: p.id,
    numero: p.numero,
    status: p.status,
    statusPagamento: p.statusPagamento,
    tipo: p.tipo,
    total: p.total,
    criadoEm: p.criadoEm,
    enderecoEntrega: p.enderecoEntrega,
    itens: p.itens.map((i) => ({
      nome: i.produto?.nome || 'Item',
      variacaoNome: i.variacaoNome,
      quantidade: i.quantidade,
    })),
  }));
}

// Busca o endereco oficial a partir do CEP (para preencher o formulario / confirmar com o cliente).
export async function buscarEnderecoPorCep(cep: string) {
  const cepLimpo = String(cep || '').replace(/\D/g, '');
  if (cepLimpo.length !== 8) {
    throw { status: 400, message: 'CEP invalido. Informe 8 digitos.' };
  }

  const dados = await consultarCep(cepLimpo);
  if (!dados || (!dados.logradouro && !dados.bairro)) {
    throw { status: 404, message: 'CEP nao encontrado.' };
  }

  const enderecoFormatado = [dados.logradouro, dados.bairro].filter(Boolean).join(', ');
  return {
    cep: cepLimpo,
    logradouro: dados.logradouro,
    bairro: dados.bairro,
    cidade: dados.cidade,
    uf: dados.uf,
    enderecoFormatado,
  };
}

export async function buscarPedidoCardapio(pedidoId: string) {
  const pedidoRaw = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: {
      itens: { include: { produto: true } },
      historico: { orderBy: { criadoEm: 'asc' } },
    },
  });
  if (!pedidoRaw) throw { status: 404, message: 'Pedido nao encontrado.' };

  const pedido = await sincronizarPagamentoPixMercadoPago(pedidoRaw);
  const whatsappAtendimento = await montarWhatsappAtendimentoPublico();

  return {
    ...pedido,
    mercadoPago: montarMercadoPagoDoPedido(pedido),
    whatsappAtendimento,
  };
}

export async function confirmarPagamento(pedidoId: string, metodoPagamento: string) {
  return marcarPedidoComoPago(pedidoId, metodoPagamento, 'confirmacao manual do cardapio');
}
