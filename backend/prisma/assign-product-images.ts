import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const commonsFileUrl = (fileName: string) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}`;

const updates = [
  { nome: 'Porção de Frango a Passarinho', imagemUrl: commonsFileUrl('Fried chicken pieces coated in sauce with sesame seeds 2025.jpg') },
  { nome: 'Porção de Calabresa Acebolada', imagemUrl: commonsFileUrl('Platter meat and sausage with potato slices.jpg') },
  { nome: 'Batata Frita com Cheddar e Bacon', imagemUrl: commonsFileUrl('French fries 3.jpg') },
  { nome: 'Onion Rings Crocantes', imagemUrl: commonsFileUrl('Onion Rings - Gourmet Burger Kitchen 2023-10-03.jpg') },
  { nome: 'Burger Barracão', imagemUrl: commonsFileUrl('Bacon Cheddar Burger (2121943498).jpg') },
  { nome: 'X-Salada Artesanal', imagemUrl: commonsFileUrl('Hamburger sandwich.jpg') },
  { nome: 'Picanha na Chapa', imagemUrl: commonsFileUrl('Grilled steak served with orange slices and sauce on wooden board - Flickr - nenadstojkovicart.jpg') },
  { nome: 'Filé de Frango à Parmegiana', imagemUrl: commonsFileUrl('Chicken parmigiana.jpg') },
  { nome: 'Chopp Pilsen 500ml', imagemUrl: commonsFileUrl('Thomaskirche Pils.jpg') },
  { nome: 'Refrigerante Lata 350ml', imagemUrl: commonsFileUrl('Tumbler of cola with ice.jpg') },
  { nome: 'Água Mineral 500ml', imagemUrl: commonsFileUrl('San Pellegrino 500ml bottle.jpg') },
  { nome: 'Suco Natural de Laranja 500ml', imagemUrl: commonsFileUrl('Glass of Fresh Orange Juice.jpg') },
  { nome: 'Caipirinha de Limão', imagemUrl: commonsFileUrl('Cocktail Caipirinha raw.jpg') },
  { nome: 'Pudim de Leite Condensado', imagemUrl: commonsFileUrl('Homemade Flan.jpg') },
  { nome: 'Petit Gateau de Chocolate', imagemUrl: commonsFileUrl('Piece of chocolate cake on a white plate decorated with chocolate sauce.jpg') },
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
