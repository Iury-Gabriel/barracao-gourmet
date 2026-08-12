import { Router } from 'express';
import * as estoqueController from '../controllers/estoque.controller';
import { authMiddleware, requireAdmin } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/categorias', estoqueController.listarCategorias);
router.get('/categorias/detalhes', estoqueController.listarCategoriasDetalhes);
router.post('/categorias', estoqueController.criarCategoria);
router.put('/categorias/:id', estoqueController.atualizarCategoria);
router.delete('/categorias/:id', estoqueController.excluirCategoria);
router.post('/importar-pods', requireAdmin, estoqueController.importarPods);
router.get('/movimentacoes', estoqueController.listarMovimentacoes);
router.post('/movimentacao', estoqueController.movimentacao);
router.get('/', estoqueController.listar);
router.get('/:id', estoqueController.buscar);
router.post('/', estoqueController.criar);
router.put('/:id', estoqueController.atualizar);
router.delete('/:id', estoqueController.excluir);

export default router;
