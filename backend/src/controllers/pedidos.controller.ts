import { Request, Response, NextFunction } from 'express';
import * as pedidosService from '../services/pedidos.service';

export async function listar(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await pedidosService.listarPedidos({
      status: req.query.status as string,
      origem: req.query.origem as string,
      dataInicio: req.query.dataInicio as string,
      dataFim: req.query.dataFim as string,
      clienteId: req.query.clienteId as string,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    });
    res.json(result);
  } catch (err) { next(err); }
}

export async function buscar(req: Request, res: Response, next: NextFunction) {
  try {
    const pedido = await pedidosService.buscarPedido(req.params.id);
    res.json(pedido);
  } catch (err) { next(err); }
}

export async function paraImprimir(_req: Request, res: Response, next: NextFunction) {
  try {
    const pedidos = await pedidosService.listarPedidosParaImprimir();
    res.json(pedidos);
  } catch (err) { next(err); }
}

export async function marcarImpresso(req: Request, res: Response, next: NextFunction) {
  try {
    const pedido = await pedidosService.marcarPedidoComoImpresso(req.params.id);
    res.json(pedido);
  } catch (err) { next(err); }
}

export async function criar(req: Request, res: Response, next: NextFunction) {
  try {
    const pedido = await pedidosService.criarPedido(req.body);
    res.status(201).json(pedido);
  } catch (err) { next(err); }
}

export async function atualizarStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, obs } = req.body;
    const pedido = await pedidosService.atualizarStatus(req.params.id, status, obs);
    res.json(pedido);
  } catch (err) { next(err); }
}

export async function atualizarPagamento(req: Request, res: Response, next: NextFunction) {
  try {
    const { pagamento, statusPagamento } = req.body;
    const pedido = await pedidosService.atualizarPagamento(req.params.id, pagamento, statusPagamento);
    res.json(pedido);
  } catch (err) { next(err); }
}

export async function cancelar(req: Request, res: Response, next: NextFunction) {
  try {
    const pedido = await pedidosService.cancelarPedido(req.params.id);
    res.json(pedido);
  } catch (err) { next(err); }
}

export async function remover(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await pedidosService.removerPedido(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
}

export async function kpis(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await pedidosService.kpisPedidos(
      req.query.dataInicio as string,
      req.query.dataFim as string,
    );
    res.json(result);
  } catch (err) { next(err); }
}
