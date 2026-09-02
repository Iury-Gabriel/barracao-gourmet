import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import { logger } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';
import { uploadsDir } from './lib/uploads';
import { notificarErroCritico } from './lib/alertas';

import authRoutes from './routes/auth.routes';
import cardapioRoutes from './routes/cardapio.routes';
import pedidosRoutes from './routes/pedidos.routes';
import estoqueRoutes from './routes/estoque.routes';
import clientesRoutes from './routes/clientes.routes';
import financeiroRoutes from './routes/financeiro.routes';
import usuariosRoutes from './routes/usuarios.routes';
import entregadoresRoutes from './routes/entregadores.routes';
import uploadRoutes from './routes/upload.routes';
import iaRoutes from './routes/ia.routes';
import webhookRoutes from './routes/webhook.routes';
import atendimentosRoutes from './routes/atendimentos.routes';
import reservasRoutes from './routes/reservas.routes';
import entregasRoutes from './routes/entregas.routes';
import lojaRoutes from './routes/loja.routes';
import cuponsRoutes from './routes/cupons.routes';
import { getMercadoPagoWebhookUrl } from './services/mercado-pago.service';

// Rede de seguranca: qualquer excecao ou promise rejeitada que escape de todo o resto
// do codigo cai aqui. Isso e sempre critico (pode derrubar o processo inteiro).
process.on('uncaughtException', (error) => {
  console.error('[FATAL] uncaughtException:', error);
  notificarErroCritico('sistema', 'Erro fatal (uncaughtException) — o servidor vai reiniciar.', { detalhes: error });
  // Da um tempinho pro alerta sair antes de derrubar o processo (mesmo comportamento
  // de crash de antes, so que agora avisando).
  setTimeout(() => process.exit(1), 1500);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
  notificarErroCritico('sistema', 'Promise rejeitada sem tratamento (unhandledRejection) no servidor.', { detalhes: reason });
});

const app = express();
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:8080,http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Middlewares globais
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin não permitida pelo CORS.'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(logger);

// Servir arquivos estáticos de uploads (fotos de produtos)
app.use('/uploads', express.static(uploadsDir));

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/cardapio', cardapioRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/estoque', estoqueRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/financeiro', financeiroRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/entregadores', entregadoresRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/ia', iaRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/atendimentos', atendimentosRoutes);
app.use('/api/loja', lojaRoutes);
app.use('/api/cupons', cuponsRoutes);
app.use('/api/reservas', reservasRoutes);
app.use('/api/entregas', entregasRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

// Error handler
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`🍷 Barracão Gourmet — Backend rodando na porta ${config.port}`);
  console.log(`   Ambiente: ${config.nodeEnv}`);
  console.log(`   Health: http://localhost:${config.port}/api/health`);
  console.log(`   Uploads: ${config.publicBaseUrl}/uploads/`);
  console.log(`   Mercado Pago Webhook: ${getMercadoPagoWebhookUrl()}`);
});

export default app;
