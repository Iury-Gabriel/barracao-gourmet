import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export interface JwtPayload {
  id: string;
  email: string;
  perfil: string;
  nome: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as any);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
}

/**
 * Token do cardapio empresarial.
 *
 * Vai assinado com o mesmo segredo dos usuarios internos, entao carrega um
 * escopo proprio e o authMiddleware recusa quem tiver esse escopo. Sem isso a
 * empresa entraria com esse token em todo o painel: pedidos, financeiro e a
 * base de clientes.
 */
export const ESCOPO_CARDAPIO_EMPRESA = 'CARDAPIO_EMPRESA';

export interface EmpresaJwtPayload {
  clienteId: string;
  nome: string;
  escopo: typeof ESCOPO_CARDAPIO_EMPRESA;
}

export function signEmpresaToken(payload: Omit<EmpresaJwtPayload, 'escopo'>): string {
  return jwt.sign({ ...payload, escopo: ESCOPO_CARDAPIO_EMPRESA }, config.jwtSecret, {
    expiresIn: '12h',
  });
}

export function verifyEmpresaToken(token: string): EmpresaJwtPayload {
  const payload = jwt.verify(token, config.jwtSecret) as EmpresaJwtPayload;
  if (payload?.escopo !== ESCOPO_CARDAPIO_EMPRESA) {
    throw new Error('Token nao e do cardapio empresarial.');
  }
  return payload;
}
