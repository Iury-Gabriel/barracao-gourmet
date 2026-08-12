import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { notificarErroCritico } from '../lib/alertas';

// Rotas cujos erros ja tem alerta especifico e mais informativo em outro lugar
// (ex: pagamento no mercado-pago.service.ts). Evita notificar duas vezes o mesmo erro.
function origemPorRota(path: string): 'pagamento' | 'frete' | 'ia' | 'api' {
  if (path.includes('/pedidos') && path.includes('cartao')) return 'pagamento';
  if (path.includes('/cardapio') && path.includes('frete')) return 'frete';
  if (path.startsWith('/api/ia')) return 'ia';
  return 'api';
}

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error('[ERROR]', {
    method: req.method,
    path: req.originalUrl,
    name: err?.name,
    code: err?.code,
    message: err?.message,
    stack: err?.stack,
    cause: err?.cause,
    details: err?.details,
    raw: err,
  });

  const statusPreliminar = Number(err?.status || err?.statusCode || 500);
  // So alerta erro que realmente indica algo quebrado no sistema (5xx).
  // Erros 4xx (validacao, dados invalidos, cartao recusado etc.) sao esperados do dia a dia.
  if (statusPreliminar >= 500) {
    notificarErroCritico(origemPorRota(req.originalUrl), `Erro ${statusPreliminar} em ${req.method} ${req.originalUrl}`, {
      detalhes: { message: err?.message, code: err?.code, name: err?.name },
    });
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'Arquivo excede o limite de 500MB.',
        details: {
          code: err.code,
          field: err.field,
          message: err.message,
        },
      });
    }

    return res.status(400).json({
      error: 'Erro no upload de arquivo.',
      details: {
        code: err.code,
        field: err.field,
        message: err.message,
      },
    });
  }

  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Dados inválidos.',
      details: err.errors,
    });
  }

  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Registro duplicado.' });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Registro não encontrado.' });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Erro interno do servidor.';
  return res.status(status).json({
    error: message,
    details: {
      name: err?.name,
      code: err?.code,
      stack: err?.stack,
      cause: err?.cause,
      errorDetails: err?.details,
    },
  });
}
