import { prisma } from '../lib/prisma';

export async function listarEntregadores() {
  return prisma.entregador.findMany({
    orderBy: { nome: 'asc' },
  });
}

export async function criarEntregador(data: { nome: string; numero: string }) {
  const nome = data.nome?.trim();
  const numero = data.numero?.trim();

  if (!nome) throw { status: 400, message: 'Nome do entregador é obrigatório.' };
  if (!numero) throw { status: 400, message: 'Número do entregador é obrigatório.' };

  return prisma.entregador.create({
    data: { nome, numero },
  });
}

export async function atualizarEntregador(
  id: string,
  data: Partial<{ nome: string; numero: string }>,
) {
  const entregador = await prisma.entregador.findUnique({ where: { id } });
  if (!entregador) throw { status: 404, message: 'Entregador não encontrado.' };

  const updateData: { nome?: string; numero?: string } = {};

  if (typeof data.nome === 'string') {
    const nome = data.nome.trim();
    if (!nome) throw { status: 400, message: 'Nome do entregador é obrigatório.' };
    updateData.nome = nome;
  }

  if (typeof data.numero === 'string') {
    const numero = data.numero.trim();
    if (!numero) throw { status: 400, message: 'Número do entregador é obrigatório.' };
    updateData.numero = numero;
  }

  if (Object.keys(updateData).length === 0) {
    throw { status: 400, message: 'Nenhum campo para atualizar.' };
  }

  return prisma.entregador.update({
    where: { id },
    data: updateData,
  });
}

export async function removerEntregador(id: string) {
  const entregador = await prisma.entregador.findUnique({ where: { id } });
  if (!entregador) throw { status: 404, message: 'Entregador não encontrado.' };

  await prisma.entregador.delete({ where: { id } });
  return { message: 'Entregador removido com sucesso.' };
}
