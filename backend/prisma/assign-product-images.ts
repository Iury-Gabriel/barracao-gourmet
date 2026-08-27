import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// O cardapio atual (pratos do dia) ainda nao tem fotos oficiais do restaurante.
// Quando as fotos chegarem, mapeie aqui nome do prato -> URL da imagem e rode
// este script para preencher os produtos ja cadastrados.
const updates: Array<{ nome: string; imagemUrl: string }> = [];

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
