import { Router } from 'express';
import * as clientesController from '../controllers/clientes.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/kpis', clientesController.kpis);
router.get('/', clientesController.listar);
router.get('/:id', clientesController.buscar);
router.post('/', clientesController.criar);
router.put('/:id', clientesController.atualizar);
router.post('/:id/interacoes', clientesController.adicionarInteracao);

export default router;
