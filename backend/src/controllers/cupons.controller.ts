import { Request, Response, NextFunction } from 'express';
import * as cuponsService from '../services/cupons.service';

export async function listar(_req: Request, res: Response, next: NextFunction) {
  try {
    const cupons = await cuponsService.listarCupons();
    res.json(cupons);
  } catch (err) { next(err); }
}

export async function gerarCodigo(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ codigo: cuponsService.gerarCodigoCupom() });
  } catch (err) { next(err); }
}

export async function criar(req: Request, res: Response, next: NextFunction) {
  try {
    const cupom = await cuponsService.criarCupom(req.body);
    res.status(201).json(cupom);
  } catch (err) { next(err); }
}

export async function atualizar(req: Request, res: Response, next: NextFunction) {
  try {
    const cupom = await cuponsService.atualizarCupom(req.params.id, req.body);
    res.json(cupom);
  } catch (err) { next(err); }
}

export async function remover(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await cuponsService.removerCupom(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
}

export async function validar(req: Request, res: Response, next: NextFunction) {
  try {
    const resultado = await cuponsService.validarCupom({
      codigo: req.body.codigo,
      subtotal: Number(req.body.subtotal) || 0,
      telefoneCliente: req.body.telefoneCliente,
      formaPagamento: req.body.formaPagamento,
      tipoPedido: req.body.tipoPedido,
    });
    res.json(resultado);
  } catch (err) { next(err); }
}
