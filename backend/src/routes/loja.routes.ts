import { Router } from 'express';
import { authMiddleware, requireAdmin } from '../middleware/auth';
import * as lojaService from '../services/loja.service';

const router = Router();

// Rota pública — o cardápio consulta se a loja está aberta antes/durante o checkout.
router.get('/status', async (_req, res) => {
  try {
    // lojaFechada aqui ja considera o horario, nao so o botao manual.
    const status = await lojaService.obterStatusLoja();
    res.json({
      lojaFechada: status.lojaFechada,
      mensagemFechado: status.mensagemFechado,
      aberta: status.aberta,
      horaAbertura: status.horaAbertura,
      horaFechamento: status.horaFechamento,
      diasFuncionamento: status.diasFuncionamento,
    });
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
    const { lojaFechada, mensagemFechado, horaAbertura, horaFechamento, diasFuncionamento } = req.body;
    const data: {
      lojaFechada?: boolean;
      mensagemFechado?: string | null;
      horaAbertura?: string;
      horaFechamento?: string;
      diasFuncionamento?: number[];
    } = {};
    if (lojaFechada !== undefined) data.lojaFechada = !!lojaFechada;
    if (mensagemFechado !== undefined) data.mensagemFechado = mensagemFechado;
    // HH:MM valido; formato torto deixaria a loja fechada para sempre.
    const horaValida = (valor: unknown) => typeof valor === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(valor);
    if (horaValida(horaAbertura)) data.horaAbertura = horaAbertura;
    if (horaValida(horaFechamento)) data.horaFechamento = horaFechamento;
    if (Array.isArray(diasFuncionamento)) {
      data.diasFuncionamento = Array.from(
        new Set(diasFuncionamento.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)),
      ).sort();
    }
    const config = await lojaService.atualizarConfiguracaoLoja(data);
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
