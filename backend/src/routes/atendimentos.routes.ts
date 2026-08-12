import { Router } from 'express';
import * as atendimentosController from '../controllers/atendimentos.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/conversas', atendimentosController.listarConversas);
router.get('/conversas/:instanciaId/:remetente/mensagens', atendimentosController.listarMensagens);
router.post('/conversas/:instanciaId/:remetente/enviar', atendimentosController.enviarMensagem);
router.post('/conversas/:instanciaId/:remetente/enviar-midia', atendimentosController.enviarMidia);
router.post('/conversas/:instanciaId/:remetente/limpar-historico', atendimentosController.limparHistorico);
router.post('/conversas/:instanciaId/:remetente/ia/pausar', atendimentosController.pausarIa);
router.post('/conversas/:instanciaId/:remetente/ia/retomar', atendimentosController.retomarIa);

export default router;
