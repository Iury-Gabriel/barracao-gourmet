import { Request, Response, NextFunction } from 'express';
import * as estoqueService from '../services/estoque.service';

export async function listar(req: Request, res: Response, next: NextFunction) {
  try {
    const produtos = await estoqueService.listarProdutos({
      categoria: req.query.categoria as string,
      disponivel: req.query.disponivel as string,
      alertas: req.query.alertas === 'true',
    });
    res.json(produtos);
  } catch (err) { next(err); }
}

export async function buscar(req: Request, res: Response, next: NextFunction) {
  try {
    const produto = await estoqueService.buscarProduto(req.params.id);
    res.json(produto);
  } catch (err) { next(err); }
}

export async function criar(req: Request, res: Response, next: NextFunction) {
  try {
    const produto = await estoqueService.criarProduto(req.body);
    res.status(201).json(produto);
  } catch (err) { next(err); }
}

export async function atualizar(req: Request, res: Response, next: NextFunction) {
  try {
    const produto = await estoqueService.atualizarProduto(req.params.id, req.body);
    res.json(produto);
  } catch (err) { next(err); }
}

export async function excluir(req: Request, res: Response, next: NextFunction) {
  try {
    await estoqueService.excluirProduto(req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function movimentacao(req: Request, res: Response, next: NextFunction) {
  try {
    const mov = await estoqueService.registrarMovimentacao(req.body);
    res.status(201).json(mov);
  } catch (err) { next(err); }
}

export async function listarMovimentacoes(req: Request, res: Response, next: NextFunction) {
  try {
    const movs = await estoqueService.listarMovimentacoes(req.query.produtoId as string, req.query.tipo as string);
    res.json(movs);
  } catch (err) { next(err); }
}

export async function listarCategorias(req: Request, res: Response, next: NextFunction) {
  try {
    const cats = await estoqueService.listarCategorias();
    res.json(cats);
  } catch (err) { next(err); }
}

export async function listarCategoriasDetalhes(req: Request, res: Response, next: NextFunction) {
  try {
    const cats = await estoqueService.listarCategoriasDetalhes();
    res.json(cats);
  } catch (err) { next(err); }
}

export async function criarCategoria(req: Request, res: Response, next: NextFunction) {
  try {
    const { nome, acrescimoCartao, imagemUrl } = req.body;
    const categoria = await estoqueService.criarCategoria(nome, Number(acrescimoCartao || 0), imagemUrl);
    res.status(201).json(categoria);
  } catch (err) { next(err); }
}

export async function atualizarCategoria(req: Request, res: Response, next: NextFunction) {
  try {
    const { nome, acrescimoCartao, imagemUrl } = req.body;
    const categoria = await estoqueService.atualizarCategoria(req.params.id, {
      nome,
      acrescimoCartao: acrescimoCartao !== undefined ? Number(acrescimoCartao) : undefined,
      imagemUrl,
    });
    res.json(categoria);
  } catch (err) { next(err); }
}

export async function excluirCategoria(req: Request, res: Response, next: NextFunction) {
  try {
    await estoqueService.excluirCategoria(req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
}
