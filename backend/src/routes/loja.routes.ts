import { Router } from 'express';
import { authMiddleware, requireAdmin } from '../middleware/auth';
import * as lojaService from '../services/loja.service';

const router = Router();

// Rota pública — o cardápio consulta se a loja está aberta antes/durante o checkout.
router.get('/status', async (_req, res) => {
  try {
    const config = await lojaService.obterConfiguracaoLoja();
    res.json({ lojaFechada: config.lojaFechada, mensagemFechado: config.mensagemFechado });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Demais rotas requerem autenticação + admin
router.use(authMiddleware);
router.use(requireAdmin);

router.get('/config', async (_req, res) => {
  try {
    const config = await lojaService.obterConfiguracaoLoja();
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/config', async (req, res) => {
  try {
    const { lojaFechada, mensagemFechado } = req.body;
    const data: { lojaFechada?: boolean; mensagemFechado?: string | null } = {};
    if (lojaFechada !== undefined) data.lojaFechada = !!lojaFechada;
    if (mensagemFechado !== undefined) data.mensagemFechado = mensagemFechado;
    const config = await lojaService.atualizarConfiguracaoLoja(data);
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
