import { Router } from 'express';
import * as entregadoresController from '../controllers/entregadores.controller';
import { authMiddleware, requireAdmin } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);
router.use(requireAdmin);

router.get('/', entregadoresController.listar);
router.post('/', entregadoresController.criar);
router.put('/:id', entregadoresController.atualizar);
router.delete('/:id', entregadoresController.remover);

export default router;
