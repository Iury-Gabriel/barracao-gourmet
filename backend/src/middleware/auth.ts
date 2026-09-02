import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../lib/jwt';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.perfil !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  }
  next();
}

export function requireGerente(req: AuthRequest, res: Response, next: NextFunction) {
  if (!['ADMIN', 'GERENTE'].includes(req.user?.perfil || '')) {
    return res.status(403).json({ error: 'Acesso restrito a gerentes e administradores.' });
  }
  next();
}

// A tela de entregas serve o proprio entregador; admin e gerente entram junto
// para conseguir acompanhar e destravar problema em campo.
export function requireEntregador(req: AuthRequest, res: Response, next: NextFunction) {
  if (!['ADMIN', 'GERENTE', 'ENTREGADOR'].includes(req.user?.perfil || '')) {
    return res.status(403).json({ error: 'Acesso restrito a entregadores.' });
  }
  next();
}
