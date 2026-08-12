import { prisma } from '../lib/prisma';

export async function obterConfiguracaoLoja() {
  let config = await prisma.configuracaoLoja.findFirst();
  if (!config) {
    config = await prisma.configuracaoLoja.create({ data: {} });
  }
  return config;
}

export async function atualizarConfiguracaoLoja(data: { lojaFechada?: boolean; mensagemFechado?: string | null }) {
  const config = await obterConfiguracaoLoja();
  return prisma.configuracaoLoja.update({ where: { id: config.id }, data });
}
