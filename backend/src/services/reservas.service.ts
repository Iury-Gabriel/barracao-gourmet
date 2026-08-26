import { prisma } from '../lib/prisma';

// Antecedencia minima exigida pelo restaurante para aceitar reserva de mesa.
export const HORAS_ANTECEDENCIA_RESERVA = 48;

export const STATUS_RESERVA = ['PENDENTE', 'CONFIRMADA', 'CANCELADA', 'CONCLUIDA'] as const;
export type StatusReserva = (typeof STATUS_RESERVA)[number];

function soDigitos(valor?: string) {
  return String(valor || '').replace(/\D/g, '');
}

/**
 * Valida a data pedida contra as regras do salao: 48h de antecedencia,
 * dentro do horario de funcionamento e nao aos domingos/feriados.
 * Retorna { ok: false, motivo } em vez de lancar, porque a IA precisa do
 * motivo em texto para explicar ao cliente.
 */
export function validarDataReserva(dataHora: Date) {
  if (!(dataHora instanceof Date) || Number.isNaN(dataHora.getTime())) {
    return { ok: false as const, motivo: 'Data ou hora invalida.' };
  }

  const horasAte = (dataHora.getTime() - Date.now()) / (1000 * 60 * 60);
  if (horasAte < HORAS_ANTECEDENCIA_RESERVA) {
    return {
      ok: false as const,
      motivo: `Reserva precisa ser feita com pelo menos ${HORAS_ANTECEDENCIA_RESERVA}h de antecedencia.`,
    };
  }

  // Horario do salao: segunda a sabado, 10h as 15h. Domingo fechado.
  const diaSemana = dataHora.getDay();
  if (diaSemana === 0) {
    return { ok: false as const, motivo: 'Aos domingos o restaurante fica fechado.' };
  }

  const hora = dataHora.getHours() + dataHora.getMinutes() / 60;
  if (hora < 10 || hora > 15) {
    return { ok: false as const, motivo: 'O salao atende das 10h as 15h.' };
  }

  return { ok: true as const };
}

export async function listarReservas(filtros: { status?: string; de?: string; ate?: string } = {}) {
  const where: any = {};
  if (filtros.status) where.status = filtros.status;
  if (filtros.de || filtros.ate) {
    where.dataHora = {};
    if (filtros.de) where.dataHora.gte = new Date(filtros.de);
    if (filtros.ate) where.dataHora.lte = new Date(filtros.ate);
  }

  return prisma.reserva.findMany({
    where,
    orderBy: { dataHora: 'asc' },
    include: { cliente: { select: { id: true, nome: true, telefone: true } } },
  });
}

export async function criarReserva(data: {
  nomeCliente: string;
  telefone: string;
  pessoas: number;
  dataHora: string | Date;
  observacoes?: string;
  origem?: string;
}) {
  const dataHora = data.dataHora instanceof Date ? data.dataHora : new Date(data.dataHora);
  const validacao = validarDataReserva(dataHora);
  if (!validacao.ok) throw { status: 400, message: validacao.motivo };

  const pessoas = Number(data.pessoas);
  if (!Number.isFinite(pessoas) || pessoas < 1) {
    throw { status: 400, message: 'Informe quantas pessoas.' };
  }

  const telefone = String(data.telefone || '').trim();
  if (!soDigitos(telefone)) throw { status: 400, message: 'Telefone obrigatorio.' };

  // Vincula ao cliente existente quando o telefone ja esta na base, para a
  // reserva aparecer no historico dele.
  const digitos = soDigitos(telefone);
  const cliente = digitos
    ? await prisma.cliente.findFirst({
        where: { telefone: { contains: digitos.slice(-8) } },
        select: { id: true },
      })
    : null;

  return prisma.reserva.create({
    data: {
      nomeCliente: String(data.nomeCliente || '').trim(),
      telefone,
      pessoas,
      dataHora,
      observacoes: data.observacoes?.trim() || null,
      origem: data.origem || 'MANUAL',
      clienteId: cliente?.id ?? null,
    },
  });
}

export async function atualizarStatusReserva(id: string, status: string) {
  if (!STATUS_RESERVA.includes(status as StatusReserva)) {
    throw { status: 400, message: 'Status invalido.' };
  }
  return prisma.reserva.update({ where: { id }, data: { status } });
}

export async function atualizarReserva(
  id: string,
  data: { nomeCliente?: string; telefone?: string; pessoas?: number; dataHora?: string; observacoes?: string },
) {
  const payload: any = {};
  if (data.nomeCliente !== undefined) payload.nomeCliente = data.nomeCliente.trim();
  if (data.telefone !== undefined) payload.telefone = data.telefone.trim();
  if (data.pessoas !== undefined) payload.pessoas = Number(data.pessoas);
  if (data.observacoes !== undefined) payload.observacoes = data.observacoes?.trim() || null;
  if (data.dataHora !== undefined) {
    const dataHora = new Date(data.dataHora);
    const validacao = validarDataReserva(dataHora);
    if (!validacao.ok) throw { status: 400, message: validacao.motivo };
    payload.dataHora = dataHora;
  }
  return prisma.reserva.update({ where: { id }, data: payload });
}

export async function excluirReserva(id: string) {
  await prisma.reserva.delete({ where: { id } });
}
