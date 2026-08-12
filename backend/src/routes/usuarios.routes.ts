import { Router } from 'express';
import * as usuariosController from '../controllers/usuarios.controller';
import { authMiddleware, requireAdmin } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// Alterar própria senha — qualquer usuário autenticado
router.post('/senha', usuariosController.alterarSenha as any);

// Gerenciar usuários — apenas admin
router.get('/', requireAdmin, usuariosController.listar);
router.post('/', requireAdmin, usuariosController.criar);
router.put('/:id', requireAdmin, usuariosController.atualizar);

export default router;
