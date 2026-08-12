import { Router } from 'express';
import * as cuponsController from '../controllers/cupons.controller';
import { authMiddleware, requireAdmin } from '../middleware/auth';

const router = Router();

// Rota publica — o cardapio digital valida o cupom antes/durante o checkout.
router.post('/validar', cuponsController.validar);

// Demais rotas requerem autenticacao + admin
router.use(authMiddleware);
router.use(requireAdmin);

router.get('/', cuponsController.listar);
router.get('/gerar-codigo', cuponsController.gerarCodigo);
router.post('/', cuponsController.criar);
router.put('/:id', cuponsController.atualizar);
router.delete('/:id', cuponsController.remover);

export default router;
