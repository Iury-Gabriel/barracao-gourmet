import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // Cardapio do Barracao: prato do dia, muda conforme o dia da semana.
  // Todos acompanham arroz, feijao, batata, legumes e farofa.
  // diasSemana: 1=segunda .. 6=sabado (domingo fechado). Vazio = todos os dias.
  // Transcrito das artes oficiais enviadas pelo cliente em 27/08/2026.
  const ACOMPANHA = 'Acompanha arroz, feijão, batata, legumes e farofa';
  const TODOS_OS_DIAS = [1, 2, 3, 4, 5, 6];

  const produtos = [
    // ===== R$ 20 =====
    { nome: 'Frango assado',          preco: 20.0, diasSemana: TODOS_OS_DIAS },
    { nome: 'Linguiça',               preco: 20.0, diasSemana: [1, 2, 4, 5] },
    { nome: 'Galinha com quiabo',     preco: 20.0, diasSemana: [3, 6] },

    // ===== R$ 22 =====
    { nome: 'Bisteca',                preco: 22.0, diasSemana: [1, 3, 6] },
    { nome: 'Calabresa',              preco: 22.0, diasSemana: [1, 5] },
    { nome: 'Filé de frango',         preco: 22.0, diasSemana: TODOS_OS_DIAS },
    { nome: 'Dobradinha',             preco: 22.0, diasSemana: [2] },
    { nome: 'Strogonoff',             preco: 22.0, diasSemana: [2] },
    { nome: 'Panqueca',               preco: 22.0, diasSemana: [2] },
    { nome: 'Pernil assado',          preco: 22.0, diasSemana: [2, 3, 4, 5, 6] },
    { nome: 'Almôndegas',             preco: 22.0, diasSemana: [3, 6] },
    { nome: 'Mocotó',                 preco: 22.0, diasSemana: [4] },
    { nome: 'Fígado acebolado',       preco: 22.0, diasSemana: [4] },
    { nome: 'Sarapatel',              preco: 22.0, diasSemana: [5] },

    // ===== R$ 24 =====
    { nome: 'Omelete',                preco: 24.0, diasSemana: TODOS_OS_DIAS },
    { nome: 'Picadinho',              preco: 24.0, diasSemana: [1] },
    { nome: 'Lasanha',                preco: 24.0, diasSemana: [4, 6] },
    { nome: 'Costela',                preco: 24.0, diasSemana: [4] },
    { nome: 'Peixe frito',            preco: 24.0, diasSemana: [5] },

    // ===== R$ 25 =====
    { nome: 'Costelinha',             preco: 25.0, diasSemana: [2] },
    { nome: 'Cupim ao molho',         preco: 25.0, diasSemana: [4] },
    { nome: 'Rabada',                 preco: 25.0, diasSemana: [5] },

    // ===== R$ 27 =====
    { nome: 'Churrasco',              preco: 27.0, diasSemana: TODOS_OS_DIAS },
    { nome: 'Virado à paulista',      preco: 27.0, diasSemana: [1] },
    { nome: 'Parmegiana de frango',   preco: 27.0, diasSemana: TODOS_OS_DIAS },
    { nome: 'Frango à milanesa',      preco: 27.0, diasSemana: [1, 3, 4, 5, 6] },
    { nome: 'Feijoada (tudo junto)',  preco: 27.0, diasSemana: [3, 6] },
    { nome: 'Peixe ao molho',         preco: 27.0, diasSemana: [5] },

    // ===== R$ 30 =====
    { nome: 'Contra com fritas',      preco: 30.0, diasSemana: [1, 2] },
    { nome: 'Bife com fritas',        preco: 30.0, diasSemana: [4, 5] },

    // ===== R$ 40 =====
    { nome: 'Feijoada (separada)',    preco: 40.0, diasSemana: [3, 6] },
  ].map((p) => ({
    ...p,
    descricao: ACOMPANHA,
    categoria: 'Pratos do Dia',
    // Custo real ainda nao informado pelo restaurante; fica zerado ate a
    // equipe preencher, para nao inventar margem no financeiro.
    custoMedio: 0,
    custoUltimaCompra: 0,
    estoque: 50,
    estoqueMinimo: 10,
    disponivel: true,
    imagemUrl: null as string | null,
  }));

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
