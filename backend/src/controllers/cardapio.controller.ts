import { Request, Response, NextFunction } from 'express';
import * as cardapioService from '../services/cardapio.service';

export async function listar(req: Request, res: Response, next: NextFunction) {
  try {
    // todos=true retorna todos os produtos (inclusive indisponíveis) para mostrar "esgotado"
    const todos = req.query.todos === 'true';
    const produtos = todos
      ? await cardapioService.listarTodosProdutosCardapio()
      : await cardapioService.listarProdutosCardapio();
    res.json(produtos);
  } catch (err) { next(err); }
}

export async function listarCategorias(_req: Request, res: Response, next: NextFunction) {
  try {
    const categorias = await cardapioService.listarCategoriasCardapio();
    res.json(categorias);
  } catch (err) { next(err); }
}

export async function criarPedido(req: Request, res: Response, next: NextFunction) {
  try {
    const pedido = await cardapioService.criarPedidoCardapio({
      ...req.body,
      ipCliente: req.ip,
    });
    res.status(201).json(pedido);
  } catch (err) { next(err); }
}

export async function calcularFrete(req: Request, res: Response, next: NextFunction) {
  try {
    const frete = await cardapioService.calcularFreteCardapio(req.body);
    res.json(frete);
  } catch (err) { next(err); }
}

export async function buscarCep(req: Request, res: Response, next: NextFunction) {
  try {
    const endereco = await cardapioService.buscarEnderecoPorCep(req.params.cep);
    res.json(endereco);
  } catch (err) { next(err); }
}

export async function buscarCliente(req: Request, res: Response, next: NextFunction) {
  try {
    const cliente = await cardapioService.buscarClienteCardapio({
      telefone: req.query.telefone as string,
      email: req.query.email as string,
    });
    res.json(cliente);
  } catch (err) { next(err); }
}

export async function cartoesSalvos(req: Request, res: Response, next: NextFunction) {
  try {
    const resultado = await cardapioService.listarCartoesSalvosCliente({
      telefone: req.query.telefone as string,
      email: req.query.email as string,
    });
    res.json(resultado);
  } catch (err) { next(err); }
}

export async function meusPedidos(req: Request, res: Response, next: NextFunction) {
  try {
    const pedidos = await cardapioService.listarPedidosCardapioCliente({
      telefone: req.query.telefone as string,
      email: req.query.email as string,
    });
    res.json({ pedidos });
  } catch (err) { next(err); }
}

export async function buscarPedido(req: Request, res: Response, next: NextFunction) {
  try {
    const pedido = await cardapioService.buscarPedidoCardapio(req.params.id);
    res.json(pedido);
  } catch (err) { next(err); }
}

export async function confirmarPagamento(req: Request, res: Response, next: NextFunction) {
  try {
    const { metodoPagamento } = req.body;
    const pedido = await cardapioService.confirmarPagamento(req.params.id, metodoPagamento);
    res.json(pedido);
  } catch (err) { next(err); }
}
