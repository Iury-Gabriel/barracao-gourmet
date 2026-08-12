import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';

export async function login(email: string, senha: string) {
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario) throw { status: 401, message: 'E-mail ou senha incorretos.' };
  if (!usuario.ativo) throw { status: 403, message: 'Usuário inativo.' };

  const senhaValida = await bcrypt.compare(senha, usuario.senha);
  if (!senhaValida) throw { status: 401, message: 'E-mail ou senha incorretos.' };

  const token = signToken({
    id: usuario.id,
    email: usuario.email,
    perfil: usuario.perfil,
    nome: usuario.nome,
  });

  return {
    token,
    user: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
    },
  };
}

export async function getMe(id: string) {
  const usuario = await prisma.usuario.findUnique({
    where: { id },
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, criadoEm: true },
  });
  if (!usuario) throw { status: 404, message: 'Usuário não encontrado.' };
  return usuario;
}
