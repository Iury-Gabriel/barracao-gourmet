import { Request, Response, NextFunction } from 'express';
import * as usuariosService from '../services/usuarios.service';
import { AuthRequest } from '../middleware/auth';

export async function listar(req: Request, res: Response, next: NextFunction) {
  try {
    const usuarios = await usuariosService.listarUsuarios();
    res.json(usuarios);
  } catch (err) { next(err); }
}

export async function criar(req: Request, res: Response, next: NextFunction) {
  try {
    const usuario = await usuariosService.criarUsuario(req.body);
    res.status(201).json(usuario);
  } catch (err) { next(err); }
}

export async function atualizar(req: Request, res: Response, next: NextFunction) {
  try {
    const usuario = await usuariosService.atualizarUsuario(req.params.id, req.body);
    res.json(usuario);
  } catch (err) { next(err); }
}

export async function alterarSenha(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { senhaAtual, novaSenha } = req.body;
    const result = await usuariosService.alterarSenha(req.user!.id, senhaAtual, novaSenha);
    res.json(result);
  } catch (err) { next(err); }
}
