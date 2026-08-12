import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const custosPorProduto: Record<string, { custoMedio: number; custoUltimaCompra: number }> = {
  'Vinho Tinto Seco Reserva': { custoMedio: 54.9, custoUltimaCompra: 54.9 },
  'Vinho Branco Chardonnay': { custoMedio: 49.9, custoUltimaCompra: 49.9 },
  'Espumante Brut': { custoMedio: 42.9, custoUltimaCompra: 42.9 },
  'Vinho Rosé Provence': { custoMedio: 46.9, custoUltimaCompra: 46.9 },
  'Whisky Single Malt 12 Anos': { custoMedio: 165.9, custoUltimaCompra: 165.9 },
  'Gin Premium London Dry': { custoMedio: 78.9, custoUltimaCompra: 78.9 },
  'Cerveja Artesanal IPA': { custoMedio: 9.8, custoUltimaCompra: 9.8 },
  'Cerveja Artesanal Stout': { custoMedio: 10.2, custoUltimaCompra: 10.2 },
  'Água Mineral com Gás 500ml': { custoMedio: 2.1, custoUltimaCompra: 2.1 },
  'Tábua de Frios Premium': { custoMedio: 54.9, custoUltimaCompra: 54.9 },
  'Vinho do Porto Tawny': { custoMedio: 71.9, custoUltimaCompra: 71.9 },
  'Cachaça Artesanal Envelhecida': { custoMedio: 48.9, custoUltimaCompra: 48.9 },
};

async function main() {
  let updated = 0;

  for (const [nome, custos] of Object.entries(custosPorProduto)) {
    const produto = await prisma.produto.findFirst({ where: { nome } });
    if (!produto) continue;

    await prisma.produto.update({
      where: { id: produto.id },
      data: {
        custoMedio: custos.custoMedio,
        custoUltimaCompra: custos.custoUltimaCompra,
      },
    });
    updated += 1;
  }

  console.log(`Atualizados ${updated} produto(s) com custos.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
