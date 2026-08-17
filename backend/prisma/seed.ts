import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // URL direta do upload.wikimedia.org, nao o Special:FilePath do commons.
  // O Special:FilePath responde 301 e a resposta do redirect nao traz
  // Access-Control-Allow-Origin, entao o navegador bloqueia a imagem por CORS.
  // O host final serve "access-control-allow-origin: *" e carrega normal.
  const COMMONS_IMAGENS: Record<string, string> = {
    'frango-passarinho': '8/8e/Fried_chicken_pieces_coated_in_sauce_with_sesame_seeds_2025.jpg',
    'calabresa': 'b/ba/Platter_meat_and_sausage_with_potato_slices.jpg',
    'batata-frita': 'e/e5/French_fries_3.jpg',
    'onion-rings': '4/41/Onion_Rings_-_Gourmet_Burger_Kitchen_2023-10-03.jpg',
    'burger': '0/0f/Bacon_Cheddar_Burger_%282121943498%29.jpg',
    'x-salada': 'e/e8/Hamburger_sandwich.jpg',
    'picanha': '1/13/Grilled_steak_served_with_orange_slices_and_sauce_on_wooden_board_-_Flickr_-_nenadstojkovicart.jpg',
    'parmegiana': '1/12/Chicken_parmigiana.jpg',
    'chopp': 'b/bf/Thomaskirche_Pils.jpg',
    'refrigerante': 'c/cf/Tumbler_of_cola_with_ice.jpg',
    'agua': '7/72/San_Pellegrino_500ml_bottle.jpg',
    'suco-laranja': '8/8c/Glass_of_Fresh_Orange_Juice.jpg',
    'caipirinha': '9/92/Cocktail_Caipirinha_raw.jpg',
    'pudim': '4/43/Homemade_Flan.jpg',
    'petit-gateau': 'e/ef/Piece_of_chocolate_cake_on_a_white_plate_decorated_with_chocolate_sauce.jpg',
  };

  const commonsFileUrl = (chave: string) =>
    `https://upload.wikimedia.org/wikipedia/commons/${COMMONS_IMAGENS[chave]}`;

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
    // ===== Porções =====
    {
      nome: 'Porção de Frango a Passarinho',
      descricao: 'Frango frito crocante no alho e óleo, com limão e salsinha. Serve 2 pessoas',
      categoria: 'Porções',
      preco: 54.90,
      custoMedio: 22.50,
      custoUltimaCompra: 22.50,
      estoque: 30,
      estoqueMinimo: 8,
      imagemUrl: commonsFileUrl('frango-passarinho'),
    },
    {
      nome: 'Porção de Calabresa Acebolada',
      descricao: 'Calabresa artesanal fatiada na chapa com cebola e vinagrete. Serve 2 pessoas',
      categoria: 'Porções',
      preco: 46.90,
      custoMedio: 18.90,
      custoUltimaCompra: 18.90,
      estoque: 35,
      estoqueMinimo: 8,
      imagemUrl: commonsFileUrl('calabresa'),
    },
    {
      nome: 'Batata Frita com Cheddar e Bacon',
      descricao: 'Batata rústica coberta com cheddar cremoso e bacon crocante',
      categoria: 'Porções',
      preco: 42.90,
      custoMedio: 15.80,
      custoUltimaCompra: 15.80,
      estoque: 40,
      estoqueMinimo: 10,
      imagemUrl: commonsFileUrl('batata-frita'),
    },
    {
      nome: 'Onion Rings Crocantes',
      descricao: 'Anéis de cebola empanados na cerveja, com molho da casa',
      categoria: 'Porções',
      preco: 32.90,
      custoMedio: 11.40,
      custoUltimaCompra: 11.40,
      estoque: 25,
      estoqueMinimo: 8,
      imagemUrl: commonsFileUrl('onion-rings'),
    },

    // ===== Lanches =====
    {
      nome: 'Burger Barracão',
      descricao: 'Blend 180g, cheddar, bacon, cebola caramelizada e molho da casa no pão brioche',
      categoria: 'Lanches',
      preco: 38.90,
      custoMedio: 14.60,
      custoUltimaCompra: 14.60,
      estoque: 45,
      estoqueMinimo: 12,
      imagemUrl: commonsFileUrl('burger'),
    },
    {
      nome: 'X-Salada Artesanal',
      descricao: 'Hambúrguer 150g, queijo prato, alface, tomate e maionese verde',
      categoria: 'Lanches',
      preco: 29.90,
      custoMedio: 10.90,
      custoUltimaCompra: 10.90,
      estoque: 45,
      estoqueMinimo: 12,
      imagemUrl: commonsFileUrl('x-salada'),
    },

    // ===== Pratos =====
    {
      nome: 'Picanha na Chapa',
      descricao: 'Picanha fatiada na chapa com arroz, farofa, vinagrete e pão de alho. Serve 2 pessoas',
      categoria: 'Pratos',
      preco: 129.90,
      custoMedio: 68.00,
      custoUltimaCompra: 68.00,
      estoque: 15,
      estoqueMinimo: 5,
      imagemUrl: commonsFileUrl('picanha'),
    },
    {
      nome: 'Filé de Frango à Parmegiana',
      descricao: 'Filé empanado com molho de tomate e muçarela gratinada, arroz e fritas',
      categoria: 'Pratos',
      preco: 64.90,
      custoMedio: 26.40,
      custoUltimaCompra: 26.40,
      estoque: 20,
      estoqueMinimo: 6,
      imagemUrl: commonsFileUrl('parmegiana'),
    },

    // ===== Bebidas =====
    {
      nome: 'Chopp Pilsen 500ml',
      descricao: 'Chopp gelado tirado na hora, colarinho na medida',
      categoria: 'Bebidas',
      preco: 14.90,
      custoMedio: 5.20,
      custoUltimaCompra: 5.20,
      estoque: 80,
      estoqueMinimo: 20,
      imagemUrl: commonsFileUrl('chopp'),
    },
    {
      nome: 'Refrigerante Lata 350ml',
      descricao: 'Cola, guaraná ou laranja, sempre gelado',
      categoria: 'Bebidas',
      preco: 8.90,
      custoMedio: 3.10,
      custoUltimaCompra: 3.10,
      estoque: 90,
      estoqueMinimo: 24,
      imagemUrl: commonsFileUrl('refrigerante'),
    },
    {
      nome: 'Água Mineral 500ml',
      descricao: 'Água mineral natural, com ou sem gás',
      categoria: 'Bebidas',
      preco: 5.90,
      custoMedio: 1.80,
      custoUltimaCompra: 1.80,
      estoque: 70,
      estoqueMinimo: 20,
      imagemUrl: commonsFileUrl('agua'),
    },
    {
      nome: 'Suco Natural de Laranja 500ml',
      descricao: 'Laranja espremida na hora, sem açúcar adicionado',
      categoria: 'Bebidas',
      preco: 12.90,
      custoMedio: 4.50,
      custoUltimaCompra: 4.50,
      estoque: 30,
      estoqueMinimo: 10,
      imagemUrl: commonsFileUrl('suco-laranja'),
    },
    {
      nome: 'Caipirinha de Limão',
      descricao: 'Cachaça artesanal, limão taiti e açúcar. Também na versão com vodka',
      categoria: 'Bebidas',
      preco: 22.90,
      custoMedio: 7.30,
      custoUltimaCompra: 7.30,
      estoque: 40,
      estoqueMinimo: 10,
      imagemUrl: commonsFileUrl('caipirinha'),
    },

    // ===== Sobremesas =====
    {
      nome: 'Pudim de Leite Condensado',
      descricao: 'Pudim cremoso da casa com calda de caramelo',
      categoria: 'Sobremesas',
      preco: 18.90,
      custoMedio: 6.20,
      custoUltimaCompra: 6.20,
      estoque: 20,
      estoqueMinimo: 6,
      imagemUrl: commonsFileUrl('pudim'),
    },
    {
      nome: 'Petit Gateau de Chocolate',
      descricao: 'Bolo quente com recheio cremoso de chocolate e sorvete de creme',
      categoria: 'Sobremesas',
      preco: 26.90,
      custoMedio: 9.10,
      custoUltimaCompra: 9.10,
      estoque: 18,
      estoqueMinimo: 6,
      imagemUrl: commonsFileUrl('petit-gateau'),
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
