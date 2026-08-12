import { prisma } from '../src/lib/prisma';

type ProdutoEntrada = {
  nome: string;
  precoPix: number;
  sabores: string[];
};

const rawLista = `
ELFBAR ICE KING 40K
R$ 95,00 pix ou dinheiro
R$ 100,00 cartão
Watermelon Ice
Summer Splash
Sour Apple Ice
Dragon Strawnana
Sour Lush Gummy
Baja Splash
Miami Mint
Double Apple Ice
Tigers Blood
Green Apple Ice
Scary Berry
Sour Strawberry Dragonfruit
Peach
Cherry Strass
Mango Magic
Kiwi Passion Fruit Guava
Strawberry Ice
Blue Razz Ice

RAB BEATS 50K
R$ 95,00 pix ou dinheiro
R$ 100,00 cartão
Sakura Grape
Menthol
Sour Watermelon
Strawberry Ice
Green Apple Ice
Triple Berry
Blueberry Lemon
Fanta Strawberry
Banana Ice
Kiwi Passion Fruit Guava
Strawberry Kiwi Ice
Miami Mint
Watermelon Ice
Pineapple Ice
Icy Mint

IGNITE V300 SLIM
R$ 120,00 pix ou dinheiro
R$ 125,00 cartão
Icy Mint
Grape Ice
Minty Melon
Strawberry Ice
Pineapple Ice
Watermelon Mix
Watermelon Ice
Strawberry Kiwi
Blueberry Ice
Blueberry Strawberry coconut
Pineapple Mango
Pineapple Kiwi Dragon Fruit
Menthol

ELFBAR BC 10K
R$ 80,00 pix ou dinheiro
R$ 85,00 cartão
Miami Mint
Blue Razz Ice
Cherry Watermelon
Blackberry Cranberry
Strawberry Kiwi Ice
Strawberry Banana

IGNITE V400 SWEET
R$  135,00 pix ou dinheiro
R$ 140,00 cartão
Strawberry Banana
Strawberry Apple Watermelon
OXBAR 30K
R$ 100,00 pix ou dinheiro
R$ 105,00 cartão
Blue Raspberry Lemon
Strawberry Watermelon Dragonfruit
Blackcurrant Lemon Ice

NIKBAR 40K
R$ 110,00 pix ou dinheiro
R$ 115,00 cartão
Passion Sour Kiwi Ice
Miami Mint
Bergamot Lime Mint
Strawberry Watermelon
Ice Mint
Grape Ice
Watermelon Ice
Strawberry Mango

OXBAR 50K
R$ 140,00 pix ou dinheiro
R$ 145,00 cartão
Strawberry Kiwi
Strawberry Ice
Strawberry Grape
Pineapple Ice
Grape Ice
Pineapple Kiwi Dragonfruit
Icy Mint
Menthol
Watermelon Ice

IGNITE V250
R$ 110,00 pix ou dinheiro
R$ 115,00 cartão
Strawberry Banana
Pineapple Ice
Sweet and Sour Pomegranate
Grape Ice
Watermelon Dragon Fruit
Watermelon Ice
Watermelon Mix
Strawberry Kiwi
Pineapple Kiwi Dragon Fruit
Minty Melon
Cactus Lime Soda
Strawberry Ice
Blueberry Ice
BLACK SHEEP 20K
R$ 100,00 pix ou dinheiro
R$ 105,00 cartão
Grape / Papaya lemon

FUNKY 7K
R$ 50,00 pix ou dinheiro
R$ 55,00 cartão
Rainbow Cloudz
Tropical Rainbow Blast
Mixed Fruit

IGNITE V80
R$ 95,00 pix ou dinheiro
R$ 100,00 cartão
Passion Fruit Sour Kiwi
Icy Mint
Blueberry Lemon
Banana Ice

ELFBAR BC 4K
R$ 55,00 pix ou dinheiro
R$ 60,00 cartão
Strawberry Kiwi
Passion Fruit Orange Guava

ELFBAR KIT 9K
R$ 100,00 pix ou dinheiro
R$ 105,00 cartão
Blue razz Ice

IGNITE V80 NEW
R$ 95,00 pix ou dinheiro
R$ 100,00 cartão
Frozen Mint Water
Grape Ice
Watermelon Ice
Strawberry Kiwi
Banana Cherry
Icy Mint
Acai Ice
Blueberry Ice
Strawberry Ice
Green Apple
LOST MARY M 15K
R$ 85,00 pix ou dinheiro
R$ 90,00 cartão
Banana Ice
Menthol
Sakura Grape
Guava Passion Fruit Kiwi
Strawberry Watermelon Ice
Kiwi Watermelon Apple
Watermelon Ice
Strawberry Banana
Miami Mint
Grape Ice

BLACK SHEEP 40K
R$ 130,00pix ou dinheiro
R$ 135,00 cartão
Fresh Mint / Mango Orange
Strawberry Kiwi / Soda Lime
Grape / Menthol

NIKBAR 10K
R$ 75,00 pix ou dinheiro
R$ 80,00 cartão
Miami Mint
Grape Apple Ice
Sakura Grape
Strawberry Ice
Strawberry Shortcake
Watermelon Sour
Pineapple Ice
Passion Sour Kiwi
Grape Ice
Strawberry Banana
Strawberry Kiwi

VAPEGIN 8K
R$ 45,00 pix ou dinheiro
R$ 50,00 cartão
Bubble Gum Ice
Blue Razz Lemonade Ice
Mango Peach Apricot Ice
Grape Ice

SEXADDCIT 28K
R$ 110,00 pix ou dinheiro
R$ 115,00 cartão
Icy Mint
Strawberry Ice
Strawberry Watermelon Ice
Strawberry Banana Ice
Passion Fruit Sour Kiwi
Menthol
Kiwi Watermelon Ice

LOST MARY DURA 35K
R$ 100,00 pix ou dinheiro
R$ 105,00 cartão
Watermelon Ice
Menthol
Green Apple Ice
Blue Razz Ice
Summer Orange
Hawaiian Juice

ELFBAR BC 15K
R$ 85,00 pix ou dinheiro
R$ 90,00 cartão
Tropical Lemonade
Pear Watermelon Dragonfruit
Bubbaloo Grape
Strawberry Ice Cream
Strawberry Ice
Watermelon Ice
Blueberry Ice

IGNITE V15
R$ 15,00 pix ou dinheiro
R$ 20,00 cartão
Blue Razz Ice
Strawberry Shake
Cucumber Ice

ELFBAR GH 23K
R$ 110,00 pix ou dinheiro
R$ 115,00 cartão
Strawberry Banana
Baja Splash
Lime Grapefruit Ice
Blue Razz Ice
Grape Ice
Kiwi Dragon Fruit
Ice Mint
Strawberry Ice
Sakura Grape

VAPE SOUL 12K
R$ 65,00 pix ou dinheiro
R$ 70,00 cartão
Mint Menthol
Watermelon Ice
Strawberry Kiwi
Strawberry Banana
Double Apple

LOST MARY 10K
R$ 80,00 pix ou dinheiro
R$ 85,00 cartão
Forest Berry Energy
Strawberry Smoothie
Apple Coconut

IGNITE V150
R$ 70,00 pix ou dinheiro
R$ 75,00 cartão
Watermelon Dragon Fruit
REFIL IGNITE 10K
R$ 70,00 pix ou dinheiro
R$ 75,00 cartão
Bluberry Ice

IGNITE V400 ICE
R$ 130,00 pix ou dinheiro
R$ 135,00 cartão
Strawberry Kiwi
Watermelon
Passion Fruit Sour Kiwi
Mint
Sakura Grape
Tutti Fruit Mix
Grape
Grape Peach

ADJUST 40K
R$ 95,00 pix ou dinheiro
R$ 100,00 cartão
Tangerine White Gummy
Watermelon B-Pop
Black Razz Baja
Midnight Ice Chilli
Strawberry Mint Candy
Mixed Mint

NIKBAR 40K
R$ 110,00 pix ou dinheiro
R$ 115,00 cartão
Blueberry Ice
Sakura Grape
Strawberry Ice
Watermelon Cherry
Passion Fruit Sour Kiwi
Watermelon Ice
Cherry Banana
Grape Ice
Menthol
Strawberry Kiwi
Strawberry Apple Watermelon

IGNITE V155
R$ 90,00 pix ou dinheiro
R$ 95,00 cartão
Watermelon Dragon Fruit
Pineapple Ice
Banana Ice
Watermelon Ice
Strawberry Watermelon Ice
Blueberry Ice
Strawberry Kiwi
Kiwi Passion Fruit Guava
Strawberry Ice

ELFBAR 45K
R$ 130,00 pix ou dinheiro
R$ 135,00 cartão
Americano Ice
Tropical Baja
Grape Ice
Green Apple Ice
Watermelon Ice
Miami Mint

ICE KING SUMMER 40K
R$ 130,00 pix ou dinheiro
R$ 135,00 cartão
Black Mint
Wild Berry Slush
Neon Twist
Green Apple Slush
Triple Berry

IGNITE V400 MIX
R$ 120,00 pix ou dinheiro
R$ 125,00 cartão
Icy Mint / Peach Grape
Pineapple Mango Ice / Strawberry Ice
Grape Pop / Peach Ice
Banana Ice / Strawberry Ice
Grape Ice / Watermelon Ice
Grape Ice / Cranberry
Strawberry Watermelon Ice / Aloe Grape
Apple Ice / Strawberry Watermelon
Orange Ice / Strawberry Ice
Mango Ice / Passion Fruit Guava
Strawberry Mango Ice / Banana Ice
Watermelon Ice / Mango Ice
Watermelon Grape Ice / Acai Ice
Blueberry Ice / Raspberry Blackberry
Mighty Melon / Menthol
IGNITE V300
R$ 120,00 pix ou dinheiro
R$ 120,00 cartão
Green Apple
Watermelon Ice
Aloe Grape Ice
Strawberry Ice
Sweet and Sour Pomegranate
Banana Ice
Strawberry Kiwi
Icy Mint

ELFBAR TE 30k
R$ 110,00 pix ou dinheiro
R$ 115,00 cartão
Winter Mint
Miami Mint
Spearmint
Strawberry Ice
Green Apple Ice
Banana Coconut Ice
Strawmelon Peach
Dragon Strawnana
Bubbaloo Grape
Acai Banana Ice
Pineapple Ice
Cherry Strazz
Strawberry Watermelon Ice

BLACK SHEEP 30K
R$ 110,00 pix ou dinheiro
R$ 115,00 cartão
Menthol / Fresh Mint
Grape / Passion fruit
`;

function parsePrecoPix(linhaPreco: string) {
  const match = linhaPreco.match(/R\$\s*([\d.,]+)/i);
  if (!match) throw new Error(`Nao foi possivel ler o preco em: ${linhaPreco}`);
  return Number(match[1].replace(/\./g, '').replace(',', '.'));
}

function isInicioProduto(linhas: string[], idx: number) {
  return (
    idx + 2 < linhas.length &&
    !linhas[idx].startsWith('R$') &&
    linhas[idx + 1].startsWith('R$') &&
    linhas[idx + 2].startsWith('R$')
  );
}

function parseLista(raw: string): ProdutoEntrada[] {
  const linhas = raw
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);

  const produtos: ProdutoEntrada[] = [];

  let i = 0;
  while (i < linhas.length) {
    if (!isInicioProduto(linhas, i)) {
      i += 1;
      continue;
    }

    const nome = linhas[i];
    const precoPix = parsePrecoPix(linhas[i + 1]);
    i += 3; // pula nome + preco pix + preco cartao

    const sabores: string[] = [];
    while (i < linhas.length && !isInicioProduto(linhas, i)) {
      const sabor = linhas[i];
      if (sabor && !sabor.startsWith('R$')) sabores.push(sabor);
      i += 1;
    }

    produtos.push({ nome, precoPix, sabores });
  }

  const merged = new Map<string, ProdutoEntrada>();
  for (const produto of produtos) {
    const key = produto.nome.toLowerCase();
    const existente = merged.get(key);
    if (!existente) {
      merged.set(key, {
        ...produto,
        sabores: Array.from(new Set(produto.sabores.map((s) => s.trim()).filter(Boolean))),
      });
      continue;
    }

    const saboresCombinados = Array.from(
      new Set([...existente.sabores, ...produto.sabores].map((s) => s.trim()).filter(Boolean)),
    );

    merged.set(key, {
      nome: existente.nome,
      precoPix: produto.precoPix || existente.precoPix,
      sabores: saboresCombinados,
    });
  }

  return Array.from(merged.values()).sort((a, b) => a.nome.localeCompare(b.nome));
}

async function main() {
  const produtos = parseLista(rawLista);

  const categoriaPod = await prisma.categoriaEstoque.upsert({
    where: { nome: 'Pod' },
    update: {},
    create: { nome: 'Pod', acrescimoCartao: 5 },
  });

  let criados = 0;
  let atualizados = 0;

  for (const produto of produtos) {
    const variacoes = produto.sabores.map((nome, ordem) => ({
      nome,
      descricao: null as string | null,
      ordem,
    }));

    const existente = await prisma.produto.findFirst({
      where: { nome: produto.nome, categoria: 'Pod' },
      select: { id: true },
    });

    if (existente) {
      await prisma.produto.update({
        where: { id: existente.id },
        data: {
          descricao: null,
          categoria: 'Pod',
          tipoVariacao: 'Sabor',
          preco: produto.precoPix,
          custoMedio: 0,
          custoUltimaCompra: 0,
          estoque: 1,
          estoqueMinimo: 1,
          disponivel: true,
          variacoes: {
            deleteMany: {},
            create: variacoes,
          },
        },
      });
      atualizados += 1;
    } else {
      await prisma.produto.create({
        data: {
          nome: produto.nome,
          descricao: null,
          categoria: 'Pod',
          tipoVariacao: 'Sabor',
          preco: produto.precoPix,
          custoMedio: 0,
          custoUltimaCompra: 0,
          estoque: 1,
          estoqueMinimo: 1,
          disponivel: true,
          variacoes: {
            create: variacoes,
          },
        },
      });
      criados += 1;
    }
  }

  console.log(`Categoria Pod id: ${categoriaPod.id}`);
  console.log(`Produtos processados: ${produtos.length}`);
  console.log(`Criados: ${criados}`);
  console.log(`Atualizados: ${atualizados}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
