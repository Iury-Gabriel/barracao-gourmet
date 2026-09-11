import { Router, Request, Response } from 'express';
import { authMiddleware, requireAdmin } from '../middleware/auth';
import { config } from '../config/env';
import * as oauth from '../services/mercado-pago-oauth.service';

/**
 * "Conectar Mercado Pago" (OAuth).
 *
 * O callback e PUBLICO de proposito: quem chama e o navegador do lojista
 * redirecionado pelo Mercado Pago, sem o token do painel. A seguranca vem do
 * `state` assinado, que expira em 15 minutos.
 */
const router = Router();

router.get('/oauth/callback', async (req: Request, res: Response) => {
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  const destino = (status: 'ok' | 'erro') =>
    `${config.painelBaseUrl}/configuracoes?aba=pagamentos&mp=${status}`;

  if (!code || !state) return res.redirect(destino('erro'));

  try {
    await oauth.finalizarConexao(code, state);
    return res.redirect(destino('ok'));
  } catch (err) {
    console.error('[mercado-pago] callback OAuth falhou', err);
    return res.redirect(destino('erro'));
  }
});

// Daqui pra baixo, so admin logado.
router.use(authMiddleware);
router.use(requireAdmin);

router.get('/status', async (_req: Request, res: Response) => {
  try {
    res.json(await oauth.statusConexao());
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'Erro ao consultar conexao.' });
  }
});

router.get('/conectar', (_req: Request, res: Response) => {
  try {
    res.json(oauth.iniciarConexao());
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'Erro ao iniciar conexao.' });
  }
});

router.post('/desconectar', async (_req: Request, res: Response) => {
  try {
    res.json(await oauth.desconectar());
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'Erro ao desconectar.' });
  }
});

export default router;
