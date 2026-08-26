import { Router } from 'express';
import * as reservasController from '../controllers/reservas.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/', reservasController.listar);
router.post('/', reservasController.criar);
router.put('/:id', reservasController.atualizar);
router.patch('/:id/status', reservasController.atualizarStatus);
router.delete('/:id', reservasController.excluir);

export default router;
