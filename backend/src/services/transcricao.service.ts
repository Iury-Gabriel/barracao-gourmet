import { prisma } from '../lib/prisma';
import { config } from '../config/env';

/**
 * Obtem a chave da OpenAI (primeiro do banco em ConfiguracaoIA, depois do env),
 * mesmo criterio usado pelo fluxo de geracao de respostas da IA.
 */
export async function obterChaveOpenAI(): Promise<string | null> {
  const configIA = await prisma.configuracaoIA.findFirst();
  return configIA?.openaiApiKey || config.openaiApiKey || null;
}

/**
 * Transcreve um buffer de audio usando a API de transcricao da OpenAI.
 * Espelha a abordagem do TgLeadBot: modelo gpt-4o-mini-transcribe, idioma pt,
 * enviando o arquivo direto (sem conversao de formato).
 */
export async function transcreverAudioBuffer(input: {
  audioBuffer: Buffer;
  mimeType: string;
  filename: string;
}): Promise<string | null> {
  const apiKey = await obterChaveOpenAI();
  if (!apiKey) {
    console.warn('[transcricao] chave OpenAI nao configurada; transcricao indisponivel.');
    return null;
  }

  try {
    const form = new FormData();
    form.append('model', 'gpt-4o-mini-transcribe');
    form.append('language', 'pt');
    form.append('response_format', 'json');
    form.append(
      'file',
      new Blob([input.audioBuffer], { type: input.mimeType || 'audio/ogg' }),
      input.filename || 'audio.ogg',
    );

    const baseUrl = (config.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[transcricao] erro HTTP na transcricao', {
        status: res.status,
        body: body.slice(0, 300),
      });
      return null;
    }

    const payload: any = await res.json().catch(() => null);
    const texto = String(payload?.text ?? '').trim();
    return texto || null;
  } catch (error) {
    console.error('[transcricao] falha ao transcrever audio', {
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}
