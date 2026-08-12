import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

export async function listarUsuarios() {
  return prisma.usuario.findMany({
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, criadoEm: true },
    orderBy: { nome: 'asc' },
  });
}

export async function criarUsuario(data: {
  nome: string;
  email: string;
  senha: string;
  perfil: string;
}) {
  const existe = await prisma.usuario.findUnique({ where: { email: data.email } });
  if (existe) throw { status: 409, message: 'E-mail já cadastrado.' };

  const senhaHash = await bcrypt.hash(data.senha, 10);
  const usuario = await prisma.usuario.create({
    data: { ...data, senha: senhaHash },
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, criadoEm: true },
  });
  return usuario;
}

export async function atualizarUsuario(id: string, data: Partial<{
  nome: string;
  email: string;
  senha: string;
  perfil: string;
  ativo: boolean;
}>) {
  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) throw { status: 404, message: 'Usuário não encontrado.' };

  const updateData: any = { ...data };
  if (data.senha) {
    updateData.senha = await bcrypt.hash(data.senha, 10);
  }

  return prisma.usuario.update({
    where: { id },
    data: updateData,
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, criadoEm: true },
  });
}

export async function alterarSenha(id: string, senhaAtual: string, novaSenha: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) throw { status: 404, message: 'Usuário não encontrado.' };

  const senhaValida = await bcrypt.compare(senhaAtual, usuario.senha);
  if (!senhaValida) throw { status: 401, message: 'Senha atual incorreta.' };

  const senhaHash = await bcrypt.hash(novaSenha, 10);
  await prisma.usuario.update({ where: { id }, data: { senha: senhaHash } });
  return { message: 'Senha alterada com sucesso.' };
}
