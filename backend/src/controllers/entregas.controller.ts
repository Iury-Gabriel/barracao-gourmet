import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as entregasService from '../services/entregas.service';

/**
 * Resolve o entregador do usuario logado. Admin e gerente nao tem cadastro de
 * entregador, entao nao podem assumir entrega nem enviar posicao: eles so
 * acompanham pelo painel.
 */
async function exigirEntregador(req: AuthRequest) {
  const entregador = await entregasService.entregadorDoUsuario(req.user!.id);
  if (!entregador) {
    throw { status: 403, message: 'Seu usuario nao esta vinculado a um entregador.' };
  }
  return entregador;
}

export async function minhasEntregas(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const entregador = await exigirEntregador(req);
    res.json(await entregasService.listarEntregasDoEntregador(entregador.id));
  } catch (err) { next(err); }
}

export async function assumir(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const entregador = await exigirEntregador(req);
    res.json(await entregasService.assumirEntrega(req.params.pedidoId, entregador.id));
  } catch (err) { next(err); }
}

export async function concluir(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const entregador = await exigirEntregador(req);
    res.json(await entregasService.concluirEntrega(req.params.pedidoId, entregador.id));
  } catch (err) { next(err); }
}

export async function enviarPosicao(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const entregador = await exigirEntregador(req);
    const posicao = await entregasService.registrarPosicao(req.params.pedidoId, entregador.id, req.body);
    res.json(posicao);
  } catch (err) { next(err); }
}
