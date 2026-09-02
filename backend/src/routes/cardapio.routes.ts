import { Router } from 'express';
import * as cardapioController from '../controllers/cardapio.controller';

const router = Router();

// Rotas públicas — sem autenticação
router.get('/', cardapioController.listar);
router.get('/categorias', cardapioController.listarCategorias);
router.post('/frete', cardapioController.calcularFrete);
router.get('/cep/:cep', cardapioController.buscarCep);
router.get('/cliente', cardapioController.buscarCliente);
router.get('/cartoes', cardapioController.cartoesSalvos);
router.get('/meus-pedidos', cardapioController.meusPedidos);
router.get('/pedido/:id/rastreio', cardapioController.rastreio);
router.post('/pedido', cardapioController.criarPedido);
router.get('/pedido/:id', cardapioController.buscarPedido);
router.post('/pedido/:id/pagamento', cardapioController.confirmarPagamento);

export default router;
