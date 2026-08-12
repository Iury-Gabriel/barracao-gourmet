import { Router, Request, Response, NextFunction } from 'express';
import { upload, uploadMidia } from '../middleware/upload';
import { authMiddleware } from '../middleware/auth';
import { buildPublicUrl } from '../lib/url';

const router = Router();

router.post('/', authMiddleware, upload.single('imagem'), (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }
    const url = buildPublicUrl(`/uploads/${req.file.filename}`);
    res.json({ url, filename: req.file.filename });
  } catch (err) {
    next(err);
  }
});

// Upload de midia (imagem ou audio) para o chat de atendimento.
router.post('/midia', authMiddleware, uploadMidia.single('arquivo'), (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }
    const url = buildPublicUrl(`/uploads/${req.file.filename}`);
    res.json({ url, filename: req.file.filename });
  } catch (err) {
    next(err);
  }
});

export default router;
