import { Request, Response, NextFunction } from 'express';
import * as reservasService from '../services/reservas.service';

export async function listar(req: Request, res: Response, next: NextFunction) {
  try {
    const reservas = await reservasService.listarReservas({
      status: req.query.status as string,
      de: req.query.de as string,
      ate: req.query.ate as string,
    });
    res.json(reservas);
  } catch (err) { next(err); }
}

export async function criar(req: Request, res: Response, next: NextFunction) {
  try {
    const reserva = await reservasService.criarReserva(req.body);
    res.status(201).json(reserva);
  } catch (err) { next(err); }
}

export async function atualizar(req: Request, res: Response, next: NextFunction) {
  try {
    const reserva = await reservasService.atualizarReserva(req.params.id, req.body);
    res.json(reserva);
  } catch (err) { next(err); }
}

export async function atualizarStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const reserva = await reservasService.atualizarStatusReserva(req.params.id, req.body.status);
    res.json(reserva);
  } catch (err) { next(err); }
}

export async function excluir(req: Request, res: Response, next: NextFunction) {
  try {
    await reservasService.excluirReserva(req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
}
