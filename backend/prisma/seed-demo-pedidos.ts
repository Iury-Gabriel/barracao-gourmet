import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MARKER = '[DEMO_PIPELINE]';

type SeedPedido = {
  clienteNome: string;
  clienteId?: string | null;
  nomeCliente?: string;
  telefoneCliente?: string;
  enderecoEntrega?: string;
  tipo: 'DELIVERY' | 'RETIRADA' | 'LOCAL';
  status: 'RECEBIDO' | 'EM_PREPARO' | 'PRONTO' | 'EM_ENTREGA' | 'ENTREGUE' | 'CANCELADO';
  origem: 'CARDAPIO_DIGITAL' | 'MANUAL' | 'WHATSAPP';
  pagamento: 'PENDENTE' | 'PIX' | 'CARTAO_CREDITO' | 'CARTAO_DEBITO' | 'DINHEIRO';
  statusPagamento: 'AGUARDANDO' | 'PAGO' | 'CANCELADO';
  observacoes?: string;
  itens: { produtoNome: string; quantidade: number }[];
  createdAt: Date;
};

function ago(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000);
}

async function main() {
  const alreadySeeded = await prisma.pedido.findFirst({
    where: { observacoes: { contains: MARKER } },
    select: { id: true },
  });

  if (alreadySeeded) {
    console.log('Pedidos demo já existem. Nenhuma ação necessária.');
    return;
  }

  const [clientes, produtos] = await Promise.all([
    prisma.cliente.findMany(),
    prisma.produto.findMany(),
  ]);

  const byCliente = (nome: string) => clientes.find((c) => c.nome === nome) ?? null;
  const byProduto = (nome: string) => {
    const produto = produtos.find((p) => p.nome === nome);
    if (!produto) throw new Error(`Produto não encontrado: ${nome}`);
    return produto;
  };

  const pedidos: SeedPedido[] = [
    {
      clienteNome: 'João Silva',
      clienteId: byCliente('João Silva')?.id,
      telefoneCliente: '(11) 99999-1111',
      enderecoEntrega: 'Rua dos Vinhateiros, 123 - Pinheiros',
      tipo: 'DELIVERY',
      status: 'RECEBIDO',
      origem: 'MANUAL',
      pagamento: 'PENDENTE',
      statusPagamento: 'AGUARDANDO',
      observacoes: `${MARKER} Pedido no começo do fluxo`,
      itens: [
        { produtoNome: 'Vinho Tinto Seco Reserva', quantidade: 1 },
        { produtoNome: 'Tábua de Frios Premium', quantidade: 1 },
      ],
      createdAt: ago(35),
    },
    {
      clienteNome: 'Maria Oliveira',
      clienteId: byCliente('Maria Oliveira')?.id,
      telefoneCliente: '(11) 99999-2222',
      enderecoEntrega: 'Rua Harmonia, 456 - Vila Madalena',
      tipo: 'DELIVERY',
      status: 'EM_PREPARO',
      origem: 'CARDAPIO_DIGITAL',
      pagamento: 'PIX',
      statusPagamento: 'PENDENTE',
      observacoes: `${MARKER} Separando pedidos da cozinha`,
      itens: [
        { produtoNome: 'Espumante Brut', quantidade: 2 },
        { produtoNome: 'Cerveja Artesanal IPA', quantidade: 6 },
      ],
      createdAt: ago(80),
    },
    {
      clienteNome: 'Carlos Souza',
      clienteId: byCliente('Carlos Souza')?.id,
      telefoneCliente: '(11) 99999-3333',
      tipo: 'RETIRADA',
      status: 'PRONTO',
      origem: 'WHATSAPP',
      pagamento: 'DINHEIRO',
      statusPagamento: 'AGUARDANDO',
      observacoes: `${MARKER} Já pode chamar no balcão`,
      itens: [
        { produtoNome: 'Whisky Single Malt 12 Anos', quantidade: 1 },
        { produtoNome: 'Gin Premium London Dry', quantidade: 1 },
      ],
      createdAt: ago(130),
    },
    {
      clienteNome: 'Iury Gabriel Miranda da Silva',
      clienteId: byCliente('Iury Gabriel Miranda da Silva')?.id,
      telefoneCliente: '(11) 98888-7777',
      enderecoEntrega: 'Av. Paulista, 1000 - Bela Vista',
      tipo: 'DELIVERY',
      status: 'EM_ENTREGA',
      origem: 'MANUAL',
      pagamento: 'CARTAO_CREDITO',
      statusPagamento: 'PENDENTE',
      observacoes: `${MARKER} Saiu para entrega`,
      itens: [
        { produtoNome: 'Vinho Branco Chardonnay', quantidade: 2 },
        { produtoNome: 'Água Mineral com Gás 500ml', quantidade: 6 },
      ],
      createdAt: ago(190),
    },
    {
      clienteNome: 'Cliente do Cardápio',
      nomeCliente: 'Cliente do Cardápio',
      telefoneCliente: '(11) 97777-6666',
      enderecoEntrega: 'Rua das Flores, 45 - Centro',
      tipo: 'DELIVERY',
      status: 'ENTREGUE',
      origem: 'CARDAPIO_DIGITAL',
      pagamento: 'PIX',
      statusPagamento: 'PAGO',
      observacoes: `${MARKER} Pedido concluído com sucesso`,
      itens: [
        { produtoNome: 'Vinho do Porto Tawny', quantidade: 1 },
        { produtoNome: 'Cachaça Artesanal Envelhecida', quantidade: 1 },
      ],
      createdAt: ago(280),
    },
    {
      clienteNome: 'Cliente cancelado',
      nomeCliente: 'Cliente cancelado',
      telefoneCliente: '(11) 96666-5555',
      tipo: 'LOCAL',
      status: 'CANCELADO',
      origem: 'WHATSAPP',
      pagamento: 'PENDENTE',
      statusPagamento: 'CANCELADO',
      observacoes: `${MARKER} Cancelado por solicitação do cliente`,
      itens: [
        { produtoNome: 'Cerveja Artesanal Stout', quantidade: 4 },
      ],
      createdAt: ago(330),
    },
    {
      clienteNome: 'João Silva',
      clienteId: byCliente('João Silva')?.id,
      telefoneCliente: '(11) 99999-1111',
      enderecoEntrega: 'Rua dos Vinhateiros, 123 - Pinheiros',
      tipo: 'DELIVERY',
      status: 'RECEBIDO',
      origem: 'CARDAPIO_DIGITAL',
      pagamento: 'PIX',
      statusPagamento: 'AGUARDANDO',
      observacoes: `${MARKER} Pedido extra para testar a lista`,
      itens: [
        { produtoNome: 'Vinho Rosé Provence', quantidade: 1 },
        { produtoNome: 'Água Mineral com Gás 500ml', quantidade: 3 },
      ],
      createdAt: ago(420),
    },
    {
      clienteNome: 'Maria Oliveira',
      clienteId: byCliente('Maria Oliveira')?.id,
      telefoneCliente: '(11) 99999-2222',
      enderecoEntrega: 'Rua Harmonia, 456 - Vila Madalena',
      tipo: 'DELIVERY',
      status: 'EM_PREPARO',
      origem: 'MANUAL',
      pagamento: 'DINHEIRO',
      statusPagamento: 'AGUARDANDO',
      observacoes: `${MARKER} Segundo pedido demo`,
      itens: [
        { produtoNome: 'Tábua de Frios Premium', quantidade: 2 },
        { produtoNome: 'Espumante Brut', quantidade: 1 },
      ],
      createdAt: ago(500),
    },
  ];

  const maxNumero = await prisma.pedido.aggregate({
    _max: { numero: true },
  });
  let numeroAtual = maxNumero._max.numero ?? 0;

  for (const pedidoBase of pedidos) {
    const produtosPedido = pedidoBase.itens.map((item) => {
      const produto = byProduto(item.produtoNome);
      return {
        produtoId: produto.id,
        quantidade: item.quantidade,
        precoUnit: produto.preco,
        subtotal: produto.preco * item.quantidade,
      };
    });

    const total = produtosPedido.reduce((sum, item) => sum + item.subtotal, 0);
    numeroAtual += 1;

    await prisma.pedido.create({
      data: {
        numero: numeroAtual,
        clienteId: pedidoBase.clienteId ?? null,
        nomeCliente: pedidoBase.nomeCliente ?? pedidoBase.clienteNome,
        telefoneCliente: pedidoBase.telefoneCliente,
        enderecoEntrega: pedidoBase.enderecoEntrega,
        tipo: pedidoBase.tipo,
        status: pedidoBase.status,
        origem: pedidoBase.origem,
        pagamento: pedidoBase.pagamento,
        statusPagamento: pedidoBase.statusPagamento,
        total,
        observacoes: pedidoBase.observacoes,
        criadoEm: pedidoBase.createdAt,
        itens: { create: produtosPedido },
        historico: {
          create: (() => {
            const base = pedidoBase.createdAt;
            const steps: { status: string; offset: number; obs?: string }[] = [];
            if (pedidoBase.status === 'CANCELADO') {
              steps.push({ status: 'RECEBIDO', offset: 25 });
              steps.push({ status: 'CANCELADO', offset: 3, obs: 'Cancelado manualmente para teste' });
            } else {
              const flow = ['RECEBIDO', 'EM_PREPARO', 'PRONTO', 'EM_ENTREGA', 'ENTREGUE'] as const;
              const targetIndex = flow.indexOf(pedidoBase.status as any);
              for (let i = 0; i <= targetIndex; i++) {
                const status = flow[i];
                steps.push({
                  status,
                  offset: Math.max(2, (targetIndex - i + 1) * 12),
                  obs: i === targetIndex ? `Status demo atual: ${status}` : undefined,
                });
              }
            }

            return steps.map((step) => ({
              status: step.status,
              obs: step.obs ?? `Demo ${step.status}`,
              criadoEm: new Date(base.getTime() + step.offset * 60 * 1000),
            }));
          })(),
        },
      },
    });
  }

  await prisma.contador.upsert({
    where: { id: 'pedido_numero' },
    update: { valor: numeroAtual },
    create: { id: 'pedido_numero', valor: numeroAtual },
  });

  console.log(`Criados ${pedidos.length} pedidos demo. Número atual: ${numeroAtual}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
