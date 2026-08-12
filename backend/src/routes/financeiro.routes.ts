import { Router } from 'express';
import * as financeiroController from '../controllers/financeiro.controller';
import { authMiddleware, requireGerente } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);
router.use(requireGerente);

router.get('/resumo', financeiroController.resumo);
router.get('/', financeiroController.listar);
router.post('/', financeiroController.criar);

export default router;
