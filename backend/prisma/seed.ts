import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  const commonsFileUrl = (fileName: string) =>
    `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}`;

  // Usuários
  const senhaAdmin = await bcrypt.hash('admin123', 10);
  await prisma.usuario.upsert({
    where: { email: 'admin@barracaogourmet.com.br' },
    update: {},
    create: { nome: 'Administrador', email: 'admin@barracaogourmet.com.br', senha: senhaAdmin, perfil: 'ADMIN' },
  });

  const senhaGerente = await bcrypt.hash('gerente123', 10);
  await prisma.usuario.upsert({
    where: { email: 'gerente@barracaogourmet.com.br' },
    update: {},
    create: { nome: 'Gerente', email: 'gerente@barracaogourmet.com.br', senha: senhaGerente, perfil: 'GERENTE' },
  });

  const senhaOp = await bcrypt.hash('operador123', 10);
  await prisma.usuario.upsert({
    where: { email: 'operador@barracaogourmet.com.br' },
    update: {},
    create: { nome: 'Operador', email: 'operador@barracaogourmet.com.br', senha: senhaOp, perfil: 'OPERADOR' },
  });

  // Produtos
  const produtos = [
    {
      nome: 'Vinho Tinto Seco Reserva',
      descricao: 'Vinho tinto encorpado, notas de frutas vermelhas e especiarias',
      categoria: 'Vinhos Tintos',
      preco: 89.90,
      custoMedio: 54.90,
      custoUltimaCompra: 54.90,
      estoque: 24,
      estoqueMinimo: 6,
      imagemUrl: commonsFileUrl('Wine Bottles.jpg'),
    },
    {
      nome: 'Vinho Branco Chardonnay',
      descricao: 'Vinho branco fresco com notas cítricas e baunilha',
      categoria: 'Vinhos Brancos',
      preco: 79.90,
      custoMedio: 49.90,
      custoUltimaCompra: 49.90,
      estoque: 18,
      estoqueMinimo: 6,
      imagemUrl: commonsFileUrl('JC Chardonnay.jpg'),
    },
    {
      nome: 'Espumante Brut',
      descricao: 'Espumante seco e elegante, ideal para celebrações',
      categoria: 'Espumantes',
      preco: 69.90,
      custoMedio: 42.90,
      custoUltimaCompra: 42.90,
      estoque: 30,
      estoqueMinimo: 10,
      imagemUrl: commonsFileUrl('Schlumberger Sparkling Bottles.JPG'),
    },
    {
      nome: 'Vinho Rosé Provence',
      descricao: 'Rosé delicado com notas florais e frutas brancas',
      categoria: 'Vinhos Rosés',
      preco: 74.90,
      custoMedio: 46.90,
      custoUltimaCompra: 46.90,
      estoque: 12,
      estoqueMinimo: 6,
      imagemUrl: commonsFileUrl('Adega de Borba Rosé.jpg'),
    },
    {
      nome: 'Whisky Single Malt 12 Anos',
      descricao: 'Whisky escocês envelhecido 12 anos em barris de carvalho',
      categoria: 'Destilados',
      preco: 249.90,
      custoMedio: 165.90,
      custoUltimaCompra: 165.90,
      estoque: 8,
      estoqueMinimo: 3,
      imagemUrl: commonsFileUrl('Bowmore Single Malt Scotch Whisky 12 years old.jpg'),
    },
    {
      nome: 'Gin Premium London Dry',
      descricao: 'Gin artesanal com 11 botânicos selecionados',
      categoria: 'Destilados',
      preco: 129.90,
      custoMedio: 78.90,
      custoUltimaCompra: 78.90,
      estoque: 15,
      estoqueMinimo: 5,
      imagemUrl: commonsFileUrl('Roku Gin.jpg'),
    },
    {
      nome: 'Cerveja Artesanal IPA',
      descricao: 'IPA com lúpulos americanos, amargor equilibrado',
      categoria: 'Cervejas',
      preco: 18.90,
      custoMedio: 9.80,
      custoUltimaCompra: 9.80,
      estoque: 48,
      estoqueMinimo: 12,
      imagemUrl: commonsFileUrl('Ærø India Pale Ale (28592484470).jpg'),
    },
    {
      nome: 'Cerveja Artesanal Stout',
      descricao: 'Stout cremosa com notas de café e chocolate',
      categoria: 'Cervejas',
      preco: 19.90,
      custoMedio: 10.20,
      custoUltimaCompra: 10.20,
      estoque: 36,
      estoqueMinimo: 12,
      imagemUrl: commonsFileUrl('D Mendocino Oatmeal Stout beer bottle 8286690116 o.jpg'),
    },
    {
      nome: 'Água Mineral com Gás 500ml',
      descricao: 'Água mineral natural com gás',
      categoria: 'Não Alcoólicos',
      preco: 6.90,
      custoMedio: 2.10,
      custoUltimaCompra: 2.10,
      estoque: 60,
      estoqueMinimo: 20,
      imagemUrl: commonsFileUrl('Bottled water (6972595593).jpg'),
    },
    {
      nome: 'Tábua de Frios Premium',
      descricao: 'Seleção de queijos e embutidos importados',
      categoria: 'Petiscos',
      preco: 89.90,
      custoMedio: 54.90,
      custoUltimaCompra: 54.90,
      estoque: 10,
      estoqueMinimo: 3,
      imagemUrl: commonsFileUrl('Charcuterie & cheese board.jpg'),
    },
    {
      nome: 'Vinho do Porto Tawny',
      descricao: 'Porto envelhecido com notas de caramelo e nozes',
      categoria: 'Vinhos Licorosos',
      preco: 119.90,
      custoMedio: 71.90,
      custoUltimaCompra: 71.90,
      estoque: 4,
      estoqueMinimo: 3,
      imagemUrl: commonsFileUrl('Over 40 years old Port.jpg'),
    },
    {
      nome: 'Cachaça Artesanal Envelhecida',
      descricao: 'Cachaça premium envelhecida em barril de amburana',
      categoria: 'Destilados',
      preco: 89.90,
      custoMedio: 48.90,
      custoUltimaCompra: 48.90,
      estoque: 10,
      estoqueMinimo: 4,
      imagemUrl: commonsFileUrl('Caipirinha and cachaça bottles - Brazil.png'),
    },
  ];

  for (const p of produtos) {
    const existing = await prisma.produto.findFirst({ where: { nome: p.nome } });
    if (!existing) {
      await prisma.produto.create({ data: { ...p, id: randomUUID() } });
    }
  }

  // Clientes
  const clientes = [
    { nome: 'João Silva', telefone: '(11) 99999-1111', email: 'joao@email.com', bairro: 'Pinheiros', cidade: 'São Paulo' },
    { nome: 'Maria Oliveira', telefone: '(11) 99999-2222', email: 'maria@email.com', bairro: 'Vila Madalena', cidade: 'São Paulo' },
    { nome: 'Carlos Souza', telefone: '(11) 99999-3333', bairro: 'Itaim Bibi', cidade: 'São Paulo' },
  ];

  for (const c of clientes) {
    const existing = await prisma.cliente.findFirst({ where: { telefone: c.telefone } });
    if (!existing) {
      await prisma.cliente.create({ data: c });
    }
  }

  console.log('✅ Seed concluído!');
  console.log('');
  console.log('Usuários criados:');
  console.log('  admin@barracaogourmet.com.br   / admin123    (ADMIN)');
  console.log('  gerente@barracaogourmet.com.br / gerente123  (GERENTE)');
  console.log('  operador@barracaogourmet.com.br / operador123 (OPERADOR)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
