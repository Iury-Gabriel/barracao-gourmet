import { Router } from 'express';
import * as pedidosController from '../controllers/pedidos.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/kpis', pedidosController.kpis);
router.get('/para-imprimir', pedidosController.paraImprimir);
router.get('/', pedidosController.listar);
router.get('/:id', pedidosController.buscar);
router.post('/', pedidosController.criar);
router.patch('/:id/status', pedidosController.atualizarStatus);
router.patch('/:id/pagamento', pedidosController.atualizarPagamento);
router.patch('/:id/marcar-impresso', pedidosController.marcarImpresso);
router.delete('/:id/remover', pedidosController.remover);
router.delete('/:id', pedidosController.cancelar);

export default router;
