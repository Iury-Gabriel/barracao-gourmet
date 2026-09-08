import { prisma } from '../lib/prisma';

export async function obterConfiguracaoLoja() {
  let config = await prisma.configuracaoLoja.findFirst();
  if (!config) {
    config = await prisma.configuracaoLoja.create({ data: {} });
  }
  return config;
}

export async function atualizarConfiguracaoLoja(data: {
  lojaFechada?: boolean;
  mensagemFechado?: string | null;
  horaAbertura?: string;
  horaFechamento?: string;
  diasFuncionamento?: number[];
}) {
  const config = await obterConfiguracaoLoja();
  return prisma.configuracaoLoja.update({ where: { id: config.id }, data });
}

/**
 * A casa esta aberta agora?
 *
 * Usa o relogio de Sao Paulo, nao o do servidor: em UTC a virada do dia cai as
 * 21h e o horario sairia deslocado em tres horas.
 *
 * O fechamento manual vale por cima do horario, porque e o que a equipe usa
 * quando acaba o gas ou o movimento fecha mais cedo.
 */
export function calcularStatusAbertura(config: {
  lojaFechada: boolean;
  horaAbertura: string;
  horaFechamento: string;
  diasFuncionamento: number[];
}) {
  if (config.lojaFechada) {
    return { aberta: false, motivo: 'FECHAMENTO_MANUAL' as const };
  }

  const agora = new Date();
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(agora);

  const diaTexto = partes.find((p) => p.type === 'weekday')?.value ?? '';
  const mapaDias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dia = mapaDias[diaTexto] ?? new Date().getDay();

  const hora = Number(partes.find((p) => p.type === 'hour')?.value ?? 0);
  const minuto = Number(partes.find((p) => p.type === 'minute')?.value ?? 0);
  const minutosAgora = hora * 60 + minuto;

  const paraMinutos = (texto: string, padrao: number) => {
    const [h, m] = String(texto || '').split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return padrao;
    return h * 60 + m;
  };

  const dias = config.diasFuncionamento?.length ? config.diasFuncionamento : [1, 2, 3, 4, 5, 6];
  if (!dias.includes(dia)) {
    return { aberta: false, motivo: 'DIA_FECHADO' as const };
  }

  const abre = paraMinutos(config.horaAbertura, 9 * 60);
  const fecha = paraMinutos(config.horaFechamento, 15 * 60);
  if (minutosAgora < abre) return { aberta: false, motivo: 'ANTES_DE_ABRIR' as const };
  if (minutosAgora >= fecha) return { aberta: false, motivo: 'DEPOIS_DE_FECHAR' as const };

  return { aberta: true, motivo: null };
}

/** Config da loja com o status calculado, que e o que o cardapio consome. */
export async function obterStatusLoja() {
  const config = await obterConfiguracaoLoja();
  const status = calcularStatusAbertura(config);

  const mensagemPorMotivo: Record<string, string> = {
    FECHAMENTO_MANUAL: config.mensagemFechado || 'Estamos fechados no momento.',
    DIA_FECHADO: `Hoje não abrimos. Atendemos das ${config.horaAbertura} às ${config.horaFechamento}.`,
    ANTES_DE_ABRIR: `Ainda não abrimos. Começamos a receber pedidos às ${config.horaAbertura}.`,
    DEPOIS_DE_FECHAR: `Já encerramos por hoje. Voltamos a receber pedidos às ${config.horaAbertura}.`,
  };

  return {
    ...config,
    aberta: status.aberta,
    // A tela ja usava lojaFechada; manter o nome evita quebrar o cardapio, mas
    // agora ele reflete tambem o horario, nao so o botao manual.
    lojaFechada: !status.aberta,
    fechamentoManual: config.lojaFechada,
    mensagemFechado: status.aberta ? null : mensagemPorMotivo[status.motivo ?? 'FECHAMENTO_MANUAL'],
  };
}
