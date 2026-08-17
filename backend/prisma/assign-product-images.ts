import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// URL direta do upload.wikimedia.org. O Special:FilePath do commons responde 301
// e o redirect nao traz Access-Control-Allow-Origin, o que faz o navegador
// bloquear a imagem por CORS. O host final serve "access-control-allow-origin: *".
const commonsFileUrl = (caminho: string) =>
  `https://upload.wikimedia.org/wikipedia/commons/${caminho}`;

const updates = [
  { nome: 'Porção de Frango a Passarinho', imagemUrl: commonsFileUrl('8/8e/Fried_chicken_pieces_coated_in_sauce_with_sesame_seeds_2025.jpg') },
  { nome: 'Porção de Calabresa Acebolada', imagemUrl: commonsFileUrl('b/ba/Platter_meat_and_sausage_with_potato_slices.jpg') },
  { nome: 'Batata Frita com Cheddar e Bacon', imagemUrl: commonsFileUrl('e/e5/French_fries_3.jpg') },
  { nome: 'Onion Rings Crocantes', imagemUrl: commonsFileUrl('4/41/Onion_Rings_-_Gourmet_Burger_Kitchen_2023-10-03.jpg') },
  { nome: 'Burger Barracão', imagemUrl: commonsFileUrl('0/0f/Bacon_Cheddar_Burger_%282121943498%29.jpg') },
  { nome: 'X-Salada Artesanal', imagemUrl: commonsFileUrl('e/e8/Hamburger_sandwich.jpg') },
  { nome: 'Picanha na Chapa', imagemUrl: commonsFileUrl('1/13/Grilled_steak_served_with_orange_slices_and_sauce_on_wooden_board_-_Flickr_-_nenadstojkovicart.jpg') },
  { nome: 'Filé de Frango à Parmegiana', imagemUrl: commonsFileUrl('1/12/Chicken_parmigiana.jpg') },
  { nome: 'Chopp Pilsen 500ml', imagemUrl: commonsFileUrl('b/bf/Thomaskirche_Pils.jpg') },
  { nome: 'Refrigerante Lata 350ml', imagemUrl: commonsFileUrl('c/cf/Tumbler_of_cola_with_ice.jpg') },
  { nome: 'Água Mineral 500ml', imagemUrl: commonsFileUrl('7/72/San_Pellegrino_500ml_bottle.jpg') },
  { nome: 'Suco Natural de Laranja 500ml', imagemUrl: commonsFileUrl('8/8c/Glass_of_Fresh_Orange_Juice.jpg') },
  { nome: 'Caipirinha de Limão', imagemUrl: commonsFileUrl('9/92/Cocktail_Caipirinha_raw.jpg') },
  { nome: 'Pudim de Leite Condensado', imagemUrl: commonsFileUrl('4/43/Homemade_Flan.jpg') },
  { nome: 'Petit Gateau de Chocolate', imagemUrl: commonsFileUrl('e/ef/Piece_of_chocolate_cake_on_a_white_plate_decorated_with_chocolate_sauce.jpg') },
];

async function main() {
  let updated = 0;

  for (const item of updates) {
    const produto = await prisma.produto.findFirst({ where: { nome: item.nome } });
    if (!produto) continue;
    await prisma.produto.update({
      where: { id: produto.id },
      data: { imagemUrl: item.imagemUrl },
    });
    updated += 1;
  }

  console.log(`Updated ${updated} produto(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
