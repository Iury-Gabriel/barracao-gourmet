import { Request, Response, NextFunction } from 'express';
import * as entregadoresService from '../services/entregadores.service';

export async function listar(_req: Request, res: Response, next: NextFunction) {
  try {
    const entregadores = await entregadoresService.listarEntregadores();
    res.json(entregadores);
  } catch (err) {
    next(err);
  }
}

export async function criar(req: Request, res: Response, next: NextFunction) {
  try {
    const entregador = await entregadoresService.criarEntregador(req.body);
    res.status(201).json(entregador);
  } catch (err) {
    next(err);
  }
}

export async function atualizar(req: Request, res: Response, next: NextFunction) {
  try {
    const entregador = await entregadoresService.atualizarEntregador(req.params.id, req.body);
    res.json(entregador);
  } catch (err) {
    next(err);
  }
}

export async function remover(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await entregadoresService.removerEntregador(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
