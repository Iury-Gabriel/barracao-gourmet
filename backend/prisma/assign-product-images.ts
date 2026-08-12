import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const updates = [
  { nome: 'Vinho Tinto Seco Reserva', imagemUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Wine%20Bottles.jpg' },
  { nome: 'Vinho Branco Chardonnay', imagemUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/JC%20Chardonnay.jpg' },
  { nome: 'Espumante Brut', imagemUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Schlumberger%20Sparkling%20Bottles.JPG' },
  { nome: 'Vinho Rosé Provence', imagemUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Adega%20de%20Borba%20Ros%C3%A9.jpg' },
  { nome: 'Whisky Single Malt 12 Anos', imagemUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bowmore%20Single%20Malt%20Scotch%20Whisky%2012%20years%20old.jpg' },
  { nome: 'Gin Premium London Dry', imagemUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Roku%20Gin.jpg' },
  { nome: 'Cerveja Artesanal IPA', imagemUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/%C3%86r%C3%B8%20India%20Pale%20Ale%20%2828592484470%29.jpg' },
  { nome: 'Cerveja Artesanal Stout', imagemUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/D%20Mendocino%20Oatmeal%20Stout%20beer%20bottle%208286690116%20o.jpg' },
  { nome: 'Água Mineral com Gás 500ml', imagemUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bottled%20water%20%286972595593%29.jpg' },
  { nome: 'Tábua de Frios Premium', imagemUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Charcuterie%20%26%20cheese%20board.jpg' },
  { nome: 'Vinho do Porto Tawny', imagemUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Over%2040%20years%20old%20Port.jpg' },
  { nome: 'Cachaça Artesanal Envelhecida', imagemUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Caipirinha%20and%20cacha%C3%A7a%20bottles%20-%20Brazil.png' },
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
