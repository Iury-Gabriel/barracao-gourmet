/*
 * Seed de DEMONSTRACAO do Barracao.
 *
 * Popula clientes, historico de pedidos entregues, pedidos no pipeline e
 * lancamentos financeiros para apresentar o sistema ao cliente.
 *
 * NAO cria nem altera produtos: usa os 31 pratos reais que ja estao no banco.
 *
 * A margem e o parametro do seed (MARGEM_ALVO): os custos sao apurados
 * primeiro, em valores realistas, e o volume de pedidos e calculado a partir
 * deles para fechar na margem pedida.
 *
 * Todo registro criado aqui tem id com prefixo "demo-", entao a limpeza e
 * exata e nao encosta em dado real:
 *   delete from itens_pedido where id like 'demo-%';
 *   delete from pedidos where id like 'demo-%';
 *   delete from lancamentos_financeiros where id like 'demo-%';
 *   delete from clientes where id like 'demo-%';
 *
 * Rodar de novo e seguro: ele apaga o proprio lote antes de recriar.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Gerador com semente fixa: o mesmo seed sempre produz a mesma demo.
let semente = 20260904;
function rnd() {
  semente = (semente * 1103515245 + 12345) % 2147483648;
  return semente / 2147483648;
}
const escolher = (arr) => arr[Math.floor(rnd() * arr.length)];
const inteiro = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const id = (p, i) => 'demo-' + p + '-' + String(i).padStart(5, '0');

// Margem alvo da demonstracao (lucro / receita).
const MARGEM_ALVO = 0.55;

// Enderecos reais da area de entrega (raio de 5km do Barracao, Jurubatuba).
const CLIENTES = [
  ['Ana Paula Ribeiro', 'Rua Nossa Senhora do Bom Conselho, 214', 'Jurubatuba', '04674-030'],
  ['Carlos Eduardo Nunes', 'Avenida Interlagos, 1832', 'Jardim Umuarama', '04661-000'],
  ['Mariana Costa Alves', 'Rua Sao Jose, 90', 'Santo Amaro', '04739-000'],
  ['Roberto Silva Menezes', 'Rua Augusto Ferreira de Morais, 455', 'Santo Amaro', '04763-000'],
  ['Juliana Ferreira Lima', 'Rua Vigario Joao de Pontes, 720', 'Chacara Santo Antonio', '04672-000'],
  ['Fernando Oliveira Braga', 'Avenida Washington Luis, 3200', 'Campo Belo', '04627-000'],
  ['Patricia Gomes Santana', 'Rua Amaro Guerra, 118', 'Jurubatuba', '04674-070'],
  ['Rodrigo Almeida Pinto', 'Rua Barao de Jaceguai, 1540', 'Campo Belo', '04606-000'],
  ['Camila Rodrigues Teixeira', 'Rua Georgia, 260', 'Brooklin Paulista', '04559-010'],
  ['Marcos Vinicius Barbosa', 'Avenida Adolfo Pinheiro, 1010', 'Santo Amaro', '04733-100'],
  ['Leticia Souza Martins', 'Rua Padre Jose de Anchieta, 88', 'Santo Amaro', '04743-030'],
  ['Bruno Henrique Cardoso', 'Rua Guararapes, 470', 'Brooklin Novo', '04561-000'],
  ['Simone Azevedo Rocha', 'Rua Alexandre Dumas, 1650', 'Chacara Santo Antonio', '04717-004'],
  ['Diego Ramos Pereira', 'Rua Verbo Divino, 1230', 'Chacara Santo Antonio', '04719-002'],
  ['Vanessa Correia Dias', 'Avenida Santo Amaro, 5100', 'Santo Amaro', '04702-001'],
  ['Thiago Moreira Castro', 'Rua Michigan, 340', 'Brooklin Paulista', '04566-000'],
  ['Renata Lopes Figueiredo', 'Rua Doutor Gastao Vidigal, 210', 'Jurubatuba', '04675-090'],
  ['Gustavo Henrique Farias', 'Avenida Engenheiro Luis Carlos Berrini, 900', 'Brooklin Novo', '04571-010'],
  ['Escritorio Contabil Vieira', 'Avenida Interlagos, 2400', 'Jardim Umuarama', '04661-100'],
  ['Oficina Mecanica Sao Jorge', 'Rua Amaro Guerra, 380', 'Jurubatuba', '04674-070'],
  ['Clinica Odonto Sorriso', 'Avenida Adolfo Pinheiro, 720', 'Santo Amaro', '04733-100'],
];

// Valor MENSAL de cada conta. Elas entram no caixa como provisao semanal
// (ver o bloco de custos): lancadas de uma vez no dia do vencimento, cada
// tela pegava ou nao aquela data e a margem pulava de 42% a 67% conforme o
// recorte (7 dias, 30 dias, total). Rateadas por semana, todo recorte fecha
// na mesma margem, que e o que a demonstracao precisa mostrar.
const CUSTOS_FIXOS = [
  ['Aluguel', 'Aluguel do salao', 4800],
  ['Folha', 'Salarios da equipe', 9600],
  ['Energia', 'Conta de luz', 980],
  ['Agua', 'Conta de agua', 320],
  ['Gas', 'Recarga de gas GLP', 640],
  ['Internet', 'Internet e telefone', 220],
];

const CUSTOS_VARIAVEIS = [
  ['Insumos', 'Compra de carnes no atacado', 900, 2200],
  ['Insumos', 'Hortifruti da semana', 380, 820],
  ['Insumos', 'Arroz, feijao e mantimentos', 500, 1100],
  ['Embalagens', 'Marmitas, sacolas e talheres', 260, 620],
  ['Limpeza', 'Produtos de limpeza', 120, 340],
  ['Marketing', 'Impulsionamento de posts', 150, 400],
  ['Manutencao', 'Manutencao de equipamento', 180, 750],
];

const FORMAS = ['PIX', 'PIX', 'PIX', 'DINHEIRO', 'CARTAO_CREDITO', 'CARTAO_CREDITO', 'CARTAO_DEBITO'];
const ORIGENS = ['WHATSAPP', 'WHATSAPP', 'WHATSAPP', 'CARDAPIO_DIGITAL', 'CARDAPIO_DIGITAL', 'MANUAL'];
const FRETES = [[2, 4], [3, 5], [4, 6], [5, 8]];

function telefone(i) {
  return '119' + String(60000000 + i * 137983).slice(0, 8);
}

// Frete real da casa: ate 2km R$4, 3km R$5, 4km R$6, 5km R$8, gratis acima de R$200.
function calcularFrete(subtotal) {
  const par = escolher(FRETES);
  return { km: par[0], frete: subtotal >= 200 ? 0 : par[1] };
}

// Agrupa por produto: sorteando o mesmo prato duas vezes, o pedido saia com
// "1x Frango assado" e "2x Frango assado" em linhas separadas na cozinha.
function montarItens(catalogo, qtdItens, proximoItemId) {
  const porProduto = new Map();
  for (let k = 0; k < qtdItens; k++) {
    const prod = escolher(catalogo);
    const quantidade = rnd() < 0.8 ? 1 : 2;
    const atual = porProduto.get(prod.id);
    if (atual) atual.quantidade += quantidade;
    else porProduto.set(prod.id, { produto: prod, quantidade });
  }

  const itens = [];
  let subtotal = 0;
  for (const linha of porProduto.values()) {
    const sub = linha.produto.preco * linha.quantidade;
    subtotal += sub;
    itens.push({
      id: proximoItemId(),
      produtoId: linha.produto.id,
      quantidade: linha.quantidade,
      precoUnit: linha.produto.preco,
      subtotal: sub,
    });
  }
  return { itens, subtotal };
}

async function main() {
  const produtos = await prisma.produto.findMany({
    where: { disponivel: true },
    select: { id: true, nome: true, preco: true, diasSemana: true },
  });
  if (produtos.length === 0) throw new Error('Nenhum produto no banco. Rode o seed real antes.');
  console.log('Produtos reais encontrados: ' + produtos.length + ' (nao serao alterados)');

  console.log('Limpando lote demo anterior...');
  await prisma.$executeRawUnsafe("delete from itens_pedido where id like 'demo-%'");
  await prisma.$executeRawUnsafe("delete from historico_pedidos where id like 'demo-%'");
  await prisma.$executeRawUnsafe("delete from pedidos where id like 'demo-%'");
  await prisma.$executeRawUnsafe("delete from lancamentos_financeiros where id like 'demo-%'");
  await prisma.$executeRawUnsafe("delete from interacoes_clientes where id like 'demo-%'");
  await prisma.$executeRawUnsafe("delete from clientes where id like 'demo-%'");

  // ---------- clientes ----------
  const clientes = [];
  for (let i = 0; i < CLIENTES.length; i++) {
    const nome = CLIENTES[i][0];
    const partes = nome.toLowerCase().split(' ');
    const c = await prisma.cliente.create({
      data: {
        id: id('cli', i + 1),
        nome,
        telefone: telefone(i + 1),
        email: partes[0] + '.' + partes[partes.length - 1] + '@email.com',
        endereco: CLIENTES[i][1],
        bairro: CLIENTES[i][2],
        cidade: 'Sao Paulo',
        cep: CLIENTES[i][3],
        ativo: true,
      },
    });
    clientes.push(c);
  }
  console.log('Clientes criados: ' + clientes.length);

  // ---------- custos (apurados antes, para dimensionar a receita) ----------
  // Os custos cobrem exatamente o mesmo periodo da receita, senao o resultado
  // sai distorcido. No mes que entra pela metade no historico, o custo fixo e
  // rateado pelos dias efetivamente cobertos.
  const agora = new Date();
  // Comeca no dia 1 do mes que cai ~60 dias atras. Se o periodo comecasse no
  // meio do mes, esse mes perderia os vencimentos anteriores ao inicio (o
  // aluguel e a folha do dia 5, por exemplo) e ficaria barato demais: a media
  // do periodo ficava boa, mas a janela dos ultimos 30 dias, essa com todas as
  // contas, aparecia com margem bem menor na tela de Projecao.
  const inicioHistorico = new Date(agora);
  inicioHistorico.setDate(inicioHistorico.getDate() - 60);
  inicioHistorico.setDate(1);
  inicioHistorico.setHours(0, 0, 0, 0);

  // Sabado move menos que dia util: o peso distribui a receita alvo pelos dias.
  const dias = [];
  let somaPesos = 0;
  const cursorDia = new Date(inicioHistorico);
  while (cursorDia <= agora) {
    if (cursorDia.getDay() !== 0) {
      // domingo a casa fecha
      const peso = cursorDia.getDay() === 6 ? 0.6 : 1;
      somaPesos += peso;
      dias.push({ dia: new Date(cursorDia), peso });
    }
    cursorDia.setDate(cursorDia.getDate() + 1);
  }

  const custos = [];
  const SEMANA_MS = 7 * 86400000;
  const ddmm = (d) =>
    String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');

  for (let t = inicioHistorico.getTime(); t <= agora.getTime(); t += SEMANA_MS) {
    const data = new Date(t);
    data.setHours(9, 0, 0, 0);
    if (data > agora) continue;

    // Fixos: 1/52 do valor anual por semana.
    for (const fixo of CUSTOS_FIXOS) {
      custos.push({
        tipo: 'CUSTO',
        categoria: fixo[0],
        descricao: fixo[1] + ' (semana ' + ddmm(data) + ')',
        valor: Math.round(((fixo[2] * 12) / 52) * (0.97 + rnd() * 0.06) * 100) / 100,
        data,
      });
    }

    // Variaveis: compra de insumo e embalagem acontece toda semana, nem toda
    // categoria em toda semana.
    for (const variavel of CUSTOS_VARIAVEIS) {
      if (rnd() < 0.25) continue;
      const dataCompra = new Date(data.getTime() + inteiro(0, 5) * 86400000);
      dataCompra.setHours(inteiro(7, 17), 0, 0, 0);
      if (dataCompra > agora) continue;
      custos.push({
        tipo: 'CUSTO',
        categoria: variavel[0],
        descricao: variavel[1],
        valor: Math.round((variavel[2] + rnd() * (variavel[3] - variavel[2])) * 100) / 100,
        data: dataCompra,
      });
    }
  }

  const custoTotal = custos.reduce((acc, c) => acc + c.valor, 0);
  const receitaAlvo = custoTotal / (1 - MARGEM_ALVO);
  console.log('Custos apurados: R$ ' + custoTotal.toFixed(2));
  console.log(
    'Receita alvo (margem ' + (MARGEM_ALVO * 100).toFixed(0) + '%): R$ ' + receitaAlvo.toFixed(2)
  );

  // ---------- historico de pedidos entregues ----------
  const maxNumero = await prisma.pedido.aggregate({ _max: { numero: true } });
  let numero = (maxNumero._max.numero || 0) + 1;

  let totalEntregue = 0;
  let seqPedido = 0;
  let seqItem = 0;
  let seqLanc = 0;
  const proximoItemId = () => id('item', ++seqItem);
  const receitas = [];
  const historicos = [];
  let seqHist = 0;

  for (const entrada of dias) {
    const diaSemana = entrada.dia.getDay();
    // So oferece prato que realmente sai nesse dia da semana.
    const doDia = produtos.filter(
      (p) => !p.diasSemana || p.diasSemana.length === 0 || p.diasSemana.includes(diaSemana)
    );
    if (doDia.length === 0) continue;

    // Cada dia recebe sua fatia da receita alvo, com uma folga aleatoria para
    // o faturamento nao ficar identico todo dia.
    const alvoDia = ((receitaAlvo * entrada.peso) / somaPesos) * (0.85 + rnd() * 0.3);
    let receitaDia = 0;

    while (receitaDia < alvoDia) {
      const data = new Date(entrada.dia);
      data.setHours(inteiro(10, 14), inteiro(0, 59), 0, 0); // almoco 10h-15h

      const cliente = escolher(clientes);
      const tipo = rnd() < 0.7 ? 'DELIVERY' : rnd() < 0.6 ? 'RETIRADA' : 'LOCAL';
      const qtdItens = rnd() < 0.55 ? 1 : rnd() < 0.85 ? 2 : inteiro(3, 5);
      const montado = montarItens(doDia, qtdItens, proximoItemId);

      const entrega = tipo === 'DELIVERY' ? calcularFrete(montado.subtotal) : { km: 0, frete: 0 };
      const total = montado.subtotal + entrega.frete;
      const forma = escolher(FORMAS);

      const obs = [];
      if (tipo === 'DELIVERY') {
        obs.push('Frete: R$ ' + entrega.frete.toFixed(2) + ' (' + entrega.km + '.0 km).');
      }
      if (forma === 'DINHEIRO') obs.push('Troco para R$ ' + Math.ceil(total / 50) * 50 + '.');

      const pedidoId = id('ped', ++seqPedido);
      const numeroAtual = numero++;
      await prisma.pedido.create({
        data: {
          id: pedidoId,
          numero: numeroAtual,
          clienteId: cliente.id,
          nomeCliente: cliente.nome,
          telefoneCliente: cliente.telefone,
          cepEntrega: tipo === 'DELIVERY' ? cliente.cep : null,
          enderecoEntrega:
            tipo === 'DELIVERY' ? cliente.endereco + ', ' + cliente.bairro + ', Sao Paulo - SP' : null,
          tipo,
          status: 'ENTREGUE',
          origem: escolher(ORIGENS),
          pagamento: forma,
          statusPagamento: 'PAGO',
          total,
          observacoes: obs.length ? obs.join(' | ') : null,
          criadoEm: data,
          itens: { create: montado.itens },
        },
      });

      receitaDia += total;
      totalEntregue += total;

      // Sem estes dois registros a tela de KPIs mostra "Tempo Medio: 0 min",
      // porque ela mede do RECEBIDO ao ENTREGUE no historico.
      const minutosAteEntregar = inteiro(22, 52);
      historicos.push(
        { id: id('hist', ++seqHist), pedidoId, status: 'RECEBIDO', criadoEm: data },
        {
          id: id('hist', ++seqHist),
          pedidoId,
          status: 'ENTREGUE',
          criadoEm: new Date(data.getTime() + minutosAteEntregar * 60000),
        }
      );

      // Receita lancada para o Financeiro bater com o Dashboard.
      receitas.push({
        id: id('lanc', ++seqLanc),
        tipo: 'RECEITA',
        categoria: 'Vendas',
        descricao: 'Pedido #' + numeroAtual + ' - ' + cliente.nome,
        valor: total,
        data,
        pedidoId,
      });
    }
  }
  console.log('Pedidos entregues criados: ' + seqPedido + ' (R$ ' + totalEntregue.toFixed(2) + ')');

  // ---------- pipeline de hoje ----------
  const hoje = new Date();
  const doDiaHoje = produtos.filter(
    (p) => !p.diasSemana || p.diasSemana.length === 0 || p.diasSemana.includes(hoje.getDay())
  );
  const catalogoHoje = doDiaHoje.length ? doDiaHoje : produtos;
  const pipeline = [['RECEBIDO', 3], ['EM_PREPARO', 2], ['PRONTO', 2], ['EM_ENTREGA', 2]];

  let minutos = 42;
  let noPipeline = 0;
  for (const etapa of pipeline) {
    for (let k = 0; k < etapa[1]; k++) {
      const cliente = escolher(clientes);
      const tipo = rnd() < 0.75 ? 'DELIVERY' : 'RETIRADA';
      const montado = montarItens(catalogoHoje, rnd() < 0.6 ? 1 : 2, proximoItemId);
      const entrega = tipo === 'DELIVERY' ? calcularFrete(montado.subtotal) : { km: 0, frete: 0 };
      const forma = escolher(FORMAS);
      const criadoEm = new Date(hoje.getTime() - minutos * 60000);
      minutos -= inteiro(3, 7);

      const obs = [];
      if (tipo === 'DELIVERY') {
        obs.push('Frete: R$ ' + entrega.frete.toFixed(2) + ' (' + entrega.km + '.0 km).');
      }
      if (forma === 'DINHEIRO') {
        obs.push('Troco para R$ ' + Math.ceil((montado.subtotal + entrega.frete) / 50) * 50 + '.');
      }

      await prisma.pedido.create({
        data: {
          id: id('ped', ++seqPedido),
          numero: numero++,
          clienteId: cliente.id,
          nomeCliente: cliente.nome,
          telefoneCliente: cliente.telefone,
          cepEntrega: tipo === 'DELIVERY' ? cliente.cep : null,
          enderecoEntrega:
            tipo === 'DELIVERY' ? cliente.endereco + ', ' + cliente.bairro + ', Sao Paulo - SP' : null,
          tipo,
          status: etapa[0],
          origem: escolher(ORIGENS),
          pagamento: forma,
          statusPagamento: forma === 'PIX' ? 'PAGO' : 'AGUARDANDO',
          total: montado.subtotal + entrega.frete,
          observacoes: obs.length ? obs.join(' | ') : null,
          criadoEm,
          itens: { create: montado.itens },
        },
      });
      noPipeline++;
    }
  }
  console.log('Pedidos no pipeline: ' + noPipeline);

  // ---------- lancamentos financeiros ----------
  // Em lote: sao milhares de linhas e uma a uma levaria minutos.
  await prisma.historicoPedido.createMany({ data: historicos });
  await prisma.lancamentoFinanceiro.createMany({ data: receitas });
  await prisma.lancamentoFinanceiro.createMany({
    data: custos.map((c) => Object.assign({ id: id('lanc', ++seqLanc) }, c)),
  });
  console.log('Lancamentos criados: ' + (receitas.length + custos.length));
  console.log('Registros de historico: ' + historicos.length);

  // Mantem a numeracao real seguindo de onde a demo parou.
  await prisma.contador.upsert({
    where: { id: 'pedido_numero' },
    update: { valor: numero - 1 },
    create: { id: 'pedido_numero', valor: numero - 1 },
  });

  const lucro = totalEntregue - custoTotal;
  console.log('');
  console.log('RESUMO');
  console.log('  clientes         ' + clientes.length);
  console.log('  pedidos totais   ' + seqPedido);
  console.log('  receita          R$ ' + totalEntregue.toFixed(2));
  console.log('  custos           R$ ' + custoTotal.toFixed(2));
  console.log('  lucro            R$ ' + lucro.toFixed(2));
  console.log('  margem           ' + ((lucro / totalEntregue) * 100).toFixed(1) + '%');
  console.log('  ticket medio     R$ ' + (totalEntregue / seqPedido).toFixed(2));
  console.log('  proximo pedido   #' + numero);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
