import { Router } from 'express';
import * as entregasController from '../controllers/entregas.controller';
import { authMiddleware, requireEntregador } from '../middleware/auth';

const router = Router();

router.use(authMiddleware, requireEntregador);

router.get('/minhas', entregasController.minhasEntregas);
router.post('/:pedidoId/assumir', entregasController.assumir);
router.post('/:pedidoId/concluir', entregasController.concluir);
router.post('/:pedidoId/posicao', entregasController.enviarPosicao);

export default router;
