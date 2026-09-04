import { Router } from 'express';
import { authMiddleware, requireAdmin, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import * as whatsappService from '../services/whatsapp.service';

const router = Router();

// Todas as rotas requerem autenticação + admin
router.use(authMiddleware);
router.use(requireAdmin);

// ===== CONFIGURAÇÃO OPENAI =====

router.get('/config', async (_req, res) => {
  try {
    let config = await prisma.configuracaoIA.findFirst();
    if (!config) {
      config = await prisma.configuracaoIA.create({ data: {} });
    }
    // Mascarar chaves sensíveis
    const maskedKey = config.openaiApiKey
      ? `${config.openaiApiKey.slice(0, 7)}...${config.openaiApiKey.slice(-4)}`
      : null;
    const maskedUzapiToken = config.uzapiAdminToken
      ? `${config.uzapiAdminToken.slice(0, 5)}...${config.uzapiAdminToken.slice(-4)}`
      : null;
    res.json({
      ...config,
      openaiApiKey: maskedKey,
      uzapiAdminToken: maskedUzapiToken,
      hasKey: !!config.openaiApiKey,
      hasUzapi: !!config.uzapiUrl && !!config.uzapiAdminToken,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/config', async (req, res) => {
  try {
    const { openaiApiKey, openaiModel, uzapiUrl, uzapiAdminToken, iaAtiva } = req.body;
    let config = await prisma.configuracaoIA.findFirst();
    if (!config) {
      config = await prisma.configuracaoIA.create({
        data: {
          openaiApiKey,
          openaiModel: openaiModel || 'gpt-5.6-luna',
          uzapiUrl,
          uzapiAdminToken,
          ...(iaAtiva !== undefined ? { iaAtiva: !!iaAtiva } : {}),
        },
      });
    } else {
      const data: any = {};
      if (openaiApiKey !== undefined) data.openaiApiKey = openaiApiKey;
      if (openaiModel !== undefined) data.openaiModel = openaiModel;
      if (uzapiUrl !== undefined) data.uzapiUrl = uzapiUrl;
      if (uzapiAdminToken !== undefined) data.uzapiAdminToken = uzapiAdminToken;
      if (iaAtiva !== undefined) data.iaAtiva = !!iaAtiva;
      config = await prisma.configuracaoIA.update({ where: { id: config.id }, data });
    }
    res.json({ sucesso: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== INSTÂNCIAS WHATSAPP =====

router.get('/instancias', async (req, res) => {
  try {
    const tipo = req.query.tipo as string | undefined;
    const instancias = await whatsappService.listarInstancias(tipo);
    // Mascarar tokens sensíveis
    const safe = instancias.map(i => ({
      ...i,
      uzapiToken: i.uzapiToken ? '***' : null,
      metaAccessToken: i.metaAccessToken ? '***' : null,
    }));
    res.json(safe);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/instancias', async (req, res) => {
  try {
    const instancia = await whatsappService.criarInstancia(req.body);
    res.status(201).json(instancia);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/instancias/:id/conectar', async (req, res) => {
  try {
    const result = await whatsappService.conectarInstancia(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/instancias/:id/status', async (req, res) => {
  try {
    const result = await whatsappService.verificarStatus(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/instancias/:id/desconectar', async (req, res) => {
  try {
    const result = await whatsappService.desconectarInstancia(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Troca as credenciais de uma instancia que ja existe, sem precisar excluir e
// recriar (o que perderia o historico de mensagens ligado a ela).
router.put('/instancias/:id/credenciais', async (req, res) => {
  try {
    const instancia = await whatsappService.atualizarCredenciais(req.params.id, req.body);
    // Mesma mascara da listagem: o token nunca volta para o navegador.
    res.json({
      ...instancia,
      uzapiToken: instancia.uzapiToken ? '***' : null,
      metaAccessToken: instancia.metaAccessToken ? '***' : null,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/instancias/:id', async (req, res) => {
  try {
    await whatsappService.excluirInstancia(req.params.id);
    res.json({ sucesso: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ===== NUMEROS DO AGENTE DE GESTAO =====
// Numeros que, na instancia unica, falam com o agente de gestao em vez do atendimento.

router.get('/numeros-gestao', async (_req, res) => {
  try {
    const numeros = await prisma.numeroGestao.findMany({ orderBy: { criadoEm: 'desc' } });
    res.json(numeros);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/numeros-gestao', async (req, res) => {
  try {
    const numeroDigitos = String(req.body?.numero || '').replace(/\D/g, '');
    const nome = req.body?.nome ? String(req.body.nome).trim() : null;

    if (numeroDigitos.length < 10) {
      return res.status(400).json({ error: 'Informe um numero valido com DDD (ex: 11 99999-9999).' });
    }

    // Impede duplicado tolerando variacao de formato (com/sem 55, com/sem o 9).
    const alvo = whatsappService.canonicalizarNumeroBr(numeroDigitos);
    const existentes = await prisma.numeroGestao.findMany();
    if (existentes.some((registro) => whatsappService.canonicalizarNumeroBr(registro.numero) === alvo)) {
      return res.status(400).json({ error: 'Esse numero ja esta cadastrado.' });
    }

    const criado = await prisma.numeroGestao.create({ data: { numero: numeroDigitos, nome } });
    res.status(201).json(criado);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/numeros-gestao/:id', async (req, res) => {
  try {
    await prisma.numeroGestao.delete({ where: { id: req.params.id } });
    res.json({ sucesso: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
