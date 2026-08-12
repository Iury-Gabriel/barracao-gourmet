import { Request, Response, NextFunction } from 'express';
import * as clientesService from '../services/clientes.service';

export async function listar(req: Request, res: Response, next: NextFunction) {
  try {
    const clientes = await clientesService.listarClientes({
      busca: req.query.busca as string,
      ativo: req.query.ativo as string,
    });
    res.json(clientes);
  } catch (err) { next(err); }
}

export async function buscar(req: Request, res: Response, next: NextFunction) {
  try {
    const cliente = await clientesService.buscarCliente(req.params.id);
    res.json(cliente);
  } catch (err) { next(err); }
}

export async function criar(req: Request, res: Response, next: NextFunction) {
  try {
    const cliente = await clientesService.criarCliente(req.body);
    res.status(201).json(cliente);
  } catch (err) { next(err); }
}

export async function atualizar(req: Request, res: Response, next: NextFunction) {
  try {
    const cliente = await clientesService.atualizarCliente(req.params.id, req.body);
    res.json(cliente);
  } catch (err) { next(err); }
}

export async function adicionarInteracao(req: Request, res: Response, next: NextFunction) {
  try {
    const { tipo, descricao } = req.body;
    const interacao = await clientesService.adicionarInteracao(req.params.id, tipo, descricao);
    res.status(201).json(interacao);
  } catch (err) { next(err); }
}

export async function kpis(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await clientesService.kpisClientes();
    res.json(result);
  } catch (err) { next(err); }
}
