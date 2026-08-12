import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';

/**
 * Transcodifica um buffer de audio para OGG/OPUS, formato aceito pela
 * WhatsApp Cloud API (a gravacao do navegador costuma sair em webm, que a Meta recusa).
 * Retorna null se o ffmpeg nao estiver disponivel ou a conversao falhar.
 */
export async function transcodeParaOggOpus(input: Buffer, extEntrada = 'webm'): Promise<Buffer | null> {
  const dir = os.tmpdir();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inputPath = path.join(dir, `in-${id}.${extEntrada}`);
  const outputPath = path.join(dir, `out-${id}.ogg`);

  try {
    fs.writeFileSync(inputPath, input);

    const ok = await new Promise<boolean>((resolve) => {
      const proc = spawn(FFMPEG_BIN, [
        '-y',
        '-i', inputPath,
        '-vn',
        '-c:a', 'libopus',
        '-b:a', '32k',
        '-ar', '48000',
        '-ac', '1',
        '-f', 'ogg',
        outputPath,
      ]);

      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += String(d); });
      proc.on('error', (err) => {
        console.error('[audio] falha ao iniciar ffmpeg', { error: err instanceof Error ? err.message : err });
        resolve(false);
      });
      proc.on('close', (code) => {
        if (code !== 0) {
          console.error('[audio] ffmpeg retornou erro', { code, stderr: stderr.slice(-300) });
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });

    if (!ok || !fs.existsSync(outputPath)) return null;
    return fs.readFileSync(outputPath);
  } catch (error) {
    console.error('[audio] erro ao transcodar audio', { error: error instanceof Error ? error.message : error });
    return null;
  } finally {
    try { fs.existsSync(inputPath) && fs.unlinkSync(inputPath); } catch { /* ignore */ }
    try { fs.existsSync(outputPath) && fs.unlinkSync(outputPath); } catch { /* ignore */ }
  }
}
