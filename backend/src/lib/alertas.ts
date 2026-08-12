import { config } from '../config/env';

/**
 * Servico central de alerta critico via Pushover.
 *
 * Objetivo: avisar o operador (por notificacao push) sempre que algo que afeta
 * o funcionamento do sistema quebrar de verdade — erro na IA/atendimento,
 * calculo de frete, pagamento (Mercado Pago) ou chegada de webhook.
 *
 * Cuidados:
 * - Nunca lanca excecao: falha no envio do alerta jamais pode derrubar o fluxo principal.
 * - Tem cooldown por "origem" (chave do erro) para nao floodar o Pushover quando o
 *   mesmo problema se repete em rajada (ex: Redis fora do ar, cada tick tentando de novo).
 */

const PUSHOVER_URL = 'https://api.pushover.net/1/messages.json';

// Evita notificar o mesmo tipo de erro repetidamente em pouco tempo.
const COOLDOWN_MS = Number(process.env.PUSHOVER_COOLDOWN_MS || 10 * 60 * 1000); // 10 min
const ultimoEnvioPorChave = new Map<string, number>();

let avisouSemConfiguracao = false;

export type OrigemAlerta =
  | 'ia'
  | 'frete'
  | 'pagamento'
  | 'webhook'
  | 'api'
  | 'sistema';

type NotificarOpts = {
  /** Detalhes extras (objeto/erro) — vao anexados ao corpo da mensagem, resumidos. */
  detalhes?: unknown;
  /** 1 = alta prioridade (som insistente no Pushover), 0 = normal. Default: 1. */
  prioridade?: 0 | 1;
  /** Chave para agrupar/cooldown. Default: `${origem}:${titulo}`. */
  chave?: string;
};

function resumirDetalhes(detalhes: unknown): string {
  if (detalhes == null) return '';
  if (detalhes instanceof Error) {
    return [detalhes.message, detalhes.stack].filter(Boolean).join('\n').slice(0, 600);
  }
  if (typeof detalhes === 'string') return detalhes.slice(0, 600);
  try {
    return JSON.stringify(detalhes, (_key, value) => (value instanceof Error ? value.message : value), 2).slice(0, 600);
  } catch {
    return String(detalhes).slice(0, 600);
  }
}

function podeEnviar(chave: string): boolean {
  const agora = Date.now();
  const ultimo = ultimoEnvioPorChave.get(chave);
  if (ultimo && agora - ultimo < COOLDOWN_MS) return false;
  ultimoEnvioPorChave.set(chave, agora);
  return true;
}

const ORIGEM_LABEL: Record<OrigemAlerta, string> = {
  ia: 'IA / Atendimento',
  frete: 'Frete',
  pagamento: 'Pagamento',
  webhook: 'Webhook',
  api: 'API',
  sistema: 'Sistema',
};

/**
 * Envia um alerta critico via Pushover (fire-and-forget). Nunca lanca erro.
 */
export function notificarErroCritico(origem: OrigemAlerta, titulo: string, opts: NotificarOpts = {}): void {
  try {
    if (!config.pushoverToken || !config.pushoverUser) {
      if (!avisouSemConfiguracao) {
        avisouSemConfiguracao = true;
        console.warn('[alertas] PUSHOVER_TOKEN/PUSHOVER_USER nao configurados — alertas criticos desativados.');
      }
      return;
    }

    const chave = opts.chave || `${origem}:${titulo}`;
    if (!podeEnviar(chave)) return;

    const detalhesTexto = resumirDetalhes(opts.detalhes);
    const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const mensagem = [
      titulo,
      detalhesTexto ? `\n${detalhesTexto}` : '',
      `\n\n[${config.nodeEnv}] ${timestamp}`,
    ].join('').slice(0, 1024);

    const body = new URLSearchParams({
      token: config.pushoverToken,
      user: config.pushoverUser,
      title: `⚠️ Barracão Gourmet — ${ORIGEM_LABEL[origem]}`,
      message: mensagem,
      priority: String(opts.prioridade ?? 1),
    });

    fetch(PUSHOVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          console.error('[alertas] Pushover respondeu com erro', { status: res.status, body: text.slice(0, 300) });
        }
      })
      .catch((err) => {
        console.error('[alertas] falha ao enviar notificacao Pushover', err instanceof Error ? err.message : err);
      });
  } catch (err) {
    // Alerta nunca pode derrubar o fluxo principal.
    console.error('[alertas] erro inesperado ao montar notificacao', err instanceof Error ? err.message : err);
  }
}
