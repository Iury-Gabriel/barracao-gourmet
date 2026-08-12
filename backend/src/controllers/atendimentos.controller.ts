import { Request, Response, NextFunction } from 'express';
import * as atendimentosService from '../services/atendimentos.service';

export async function listarConversas(req: Request, res: Response, next: NextFunction) {
  try {
    const conversas = await atendimentosService.listarConversas({
      tipo: req.query.tipo as string,
      busca: req.query.busca as string,
    });
    res.json(conversas);
  } catch (err) { next(err); }
}

export async function listarMensagens(req: Request, res: Response, next: NextFunction) {
  try {
    const { instanciaId, remetente } = req.params;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const result = await atendimentosService.listarMensagens(instanciaId, remetente, page, limit);
    res.json(result);
  } catch (err) { next(err); }
}

export async function enviarMensagem(req: Request, res: Response, next: NextFunction) {
  try {
    const { instanciaId, remetente } = req.params;
    const { texto } = req.body;
    if (!texto || !texto.trim()) {
      return res.status(400).json({ error: 'Texto da mensagem é obrigatório.' });
    }
    const mensagem = await atendimentosService.enviarMensagemManual(instanciaId, remetente, texto.trim());
    res.status(201).json(mensagem);
  } catch (err) { next(err); }
}

export async function enviarMidia(req: Request, res: Response, next: NextFunction) {
  try {
    const { instanciaId, remetente } = req.params;
    const { tipo, url, caption } = req.body as { tipo?: string; url?: string; caption?: string };
    if (tipo !== 'IMAGEM' && tipo !== 'AUDIO') {
      return res.status(400).json({ error: 'Tipo de mídia inválido (use IMAGEM ou AUDIO).' });
    }
    if (!url || !url.trim()) {
      return res.status(400).json({ error: 'URL da mídia é obrigatória.' });
    }
    const mensagem = await atendimentosService.enviarMidiaManual(
      instanciaId,
      remetente,
      tipo,
      url.trim(),
      caption?.trim() || undefined,
    );
    res.status(201).json(mensagem);
  } catch (err) { next(err); }
}

export async function limparHistorico(req: Request, res: Response, next: NextFunction) {
  try {
    const { instanciaId, remetente } = req.params;
    const resultado = await atendimentosService.limparHistorico(instanciaId, remetente);
    res.json(resultado);
  } catch (err) { next(err); }
}

export async function pausarIa(req: Request, res: Response, next: NextFunction) {
  try {
    const { instanciaId, remetente } = req.params;
    const status = await atendimentosService.definirPausaIa(instanciaId, remetente, true);
    res.json(status);
  } catch (err) { next(err); }
}

export async function retomarIa(req: Request, res: Response, next: NextFunction) {
  try {
    const { instanciaId, remetente } = req.params;
    const status = await atendimentosService.definirPausaIa(instanciaId, remetente, false);
    res.json(status);
  } catch (err) { next(err); }
}
