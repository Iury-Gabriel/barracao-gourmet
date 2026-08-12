import { Request, Response, NextFunction } from 'express';
import * as financeiroService from '../services/financeiro.service';

export async function listar(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await financeiroService.listarLancamentos({
      tipo: req.query.tipo as string,
      categoria: req.query.categoria as string,
      dataInicio: req.query.dataInicio as string,
      dataFim: req.query.dataFim as string,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    });
    res.json(result);
  } catch (err) { next(err); }
}

export async function criar(req: Request, res: Response, next: NextFunction) {
  try {
    const lancamento = await financeiroService.criarLancamento(req.body);
    res.status(201).json(lancamento);
  } catch (err) { next(err); }
}

export async function resumo(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await financeiroService.resumoFinanceiro(
      req.query.dataInicio as string,
      req.query.dataFim as string,
    );
    res.json(result);
  } catch (err) { next(err); }
}
