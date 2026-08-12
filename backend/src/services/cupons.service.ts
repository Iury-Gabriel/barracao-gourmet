import { prisma } from '../lib/prisma';

const CARACTERES_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I para evitar confusao

export function gerarCodigoCupom(tamanho = 8) {
  let codigo = '';
  for (let i = 0; i < tamanho; i++) {
    codigo += CARACTERES_CODIGO[Math.floor(Math.random() * CARACTERES_CODIGO.length)];
  }
  return codigo;
}

function normalizarCodigo(codigo: string) {
  return String(codigo || '').trim().toUpperCase().replace(/\s+/g, '');
}

function diaDaSemanaBrasiliaAgora() {
  const agora = new Date();
  const brasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return brasilia.getUTCDay(); // 0=domingo .. 6=sabado
}

function validarCamposCupom(data: {
  tipo?: string;
  valor?: number;
  valorMinimoPedido?: number | null;
  descontoMaximo?: number | null;
  limiteUsos?: number | null;
  limitePorCliente?: number | null;
  diasSemana?: number[];
  somentePix?: boolean;
  tiposPedido?: string[];
}) {
  if (data.tipo !== undefined && data.tipo !== 'PERCENTUAL' && data.tipo !== 'VALOR_FIXO') {
    throw { status: 400, message: 'Tipo de cupom invalido. Use PERCENTUAL ou VALOR_FIXO.' };
  }
  if (data.valor !== undefined) {
    if (!Number.isFinite(data.valor) || data.valor <= 0) {
      throw { status: 400, message: 'Valor do cupom deve ser maior que zero.' };
    }
    if (data.tipo === 'PERCENTUAL' && data.valor > 100) {
      throw { status: 400, message: 'Cupom percentual nao pode passar de 100%.' };
    }
  }
  if (data.valorMinimoPedido != null && (!Number.isFinite(data.valorMinimoPedido) || data.valorMinimoPedido < 0)) {
    throw { status: 400, message: 'Valor minimo do pedido invalido.' };
  }
  if (data.descontoMaximo != null && (!Number.isFinite(data.descontoMaximo) || data.descontoMaximo <= 0)) {
    throw { status: 400, message: 'Desconto maximo invalido.' };
  }
  if (data.limiteUsos != null && (!Number.isInteger(data.limiteUsos) || data.limiteUsos <= 0)) {
    throw { status: 400, message: 'Limite de usos deve ser um numero inteiro maior que zero.' };
  }
  if (data.limitePorCliente != null && (!Number.isInteger(data.limitePorCliente) || data.limitePorCliente <= 0)) {
    throw { status: 400, message: 'Limite de usos por cliente deve ser um numero inteiro maior que zero.' };
  }
  if (data.diasSemana !== undefined) {
    if (!Array.isArray(data.diasSemana) || data.diasSemana.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      throw { status: 400, message: 'Dias da semana invalidos.' };
    }
  }
  if (data.tiposPedido !== undefined) {
    const validos = ['DELIVERY', 'RETIRADA', 'LOCAL'];
    if (!Array.isArray(data.tiposPedido) || data.tiposPedido.some((t) => !validos.includes(t))) {
      throw { status: 400, message: 'Tipo de pedido invalido. Use DELIVERY, RETIRADA ou LOCAL.' };
    }
  }
}

export async function listarCupons() {
  return prisma.cupom.findMany({ orderBy: { criadoEm: 'desc' } });
}

export async function obterCupom(id: string) {
  const cupom = await prisma.cupom.findUnique({ where: { id } });
  if (!cupom) throw { status: 404, message: 'Cupom nao encontrado.' };
  return cupom;
}

export async function criarCupom(data: {
  codigo: string;
  tipo: string;
  valor: number;
  ativo?: boolean;
  valorMinimoPedido?: number | null;
  descontoMaximo?: number | null;
  limiteUsos?: number | null;
  limitePorCliente?: number | null;
  diasSemana?: number[];
  somentePix?: boolean;
  tiposPedido?: string[];
}) {
  const codigo = normalizarCodigo(data.codigo);
  if (!codigo) throw { status: 400, message: 'Codigo do cupom e obrigatorio.' };
  validarCamposCupom(data);

  const existente = await prisma.cupom.findUnique({ where: { codigo } });
  if (existente) throw { status: 409, message: `Ja existe um cupom com o codigo "${codigo}".` };

  return prisma.cupom.create({
    data: {
      codigo,
      tipo: data.tipo,
      valor: data.valor,
      ativo: data.ativo ?? true,
      valorMinimoPedido: data.valorMinimoPedido ?? null,
      descontoMaximo: data.tipo === 'PERCENTUAL' ? (data.descontoMaximo ?? null) : null,
      limiteUsos: data.limiteUsos ?? null,
      limitePorCliente: data.limitePorCliente ?? null,
      diasSemana: Array.isArray(data.diasSemana) ? data.diasSemana : [],
      somentePix: data.somentePix ?? false,
      tiposPedido: Array.isArray(data.tiposPedido) ? data.tiposPedido : [],
    },
  });
}

export async function atualizarCupom(
  id: string,
  data: Partial<{
    codigo: string;
    tipo: string;
    valor: number;
    ativo: boolean;
    valorMinimoPedido: number | null;
    descontoMaximo: number | null;
    limiteUsos: number | null;
    limitePorCliente: number | null;
    diasSemana: number[];
    somentePix: boolean;
    tiposPedido: string[];
  }>,
) {
  const cupom = await prisma.cupom.findUnique({ where: { id } });
  if (!cupom) throw { status: 404, message: 'Cupom nao encontrado.' };

  const tipoFinal = data.tipo ?? cupom.tipo;
  validarCamposCupom({ ...data, tipo: tipoFinal, valor: data.valor ?? cupom.valor });

  const updateData: any = {};

  if (data.codigo !== undefined) {
    const codigo = normalizarCodigo(data.codigo);
    if (!codigo) throw { status: 400, message: 'Codigo do cupom e obrigatorio.' };
    if (codigo !== cupom.codigo) {
      const existente = await prisma.cupom.findUnique({ where: { codigo } });
      if (existente) throw { status: 409, message: `Ja existe um cupom com o codigo "${codigo}".` };
    }
    updateData.codigo = codigo;
  }
  if (data.tipo !== undefined) updateData.tipo = data.tipo;
  if (data.valor !== undefined) updateData.valor = data.valor;
  if (data.ativo !== undefined) updateData.ativo = data.ativo;
  if (data.valorMinimoPedido !== undefined) updateData.valorMinimoPedido = data.valorMinimoPedido;
  if (data.descontoMaximo !== undefined) updateData.descontoMaximo = tipoFinal === 'PERCENTUAL' ? data.descontoMaximo : null;
  if (data.limiteUsos !== undefined) updateData.limiteUsos = data.limiteUsos;
  if (data.limitePorCliente !== undefined) updateData.limitePorCliente = data.limitePorCliente;
  if (data.diasSemana !== undefined) updateData.diasSemana = data.diasSemana;
  if (data.somentePix !== undefined) updateData.somentePix = data.somentePix;
  if (data.tiposPedido !== undefined) updateData.tiposPedido = data.tiposPedido;

  if (tipoFinal === 'VALOR_FIXO') updateData.descontoMaximo = null;

  return prisma.cupom.update({ where: { id }, data: updateData });
}

export async function removerCupom(id: string) {
  const cupom = await prisma.cupom.findUnique({ where: { id } });
  if (!cupom) throw { status: 404, message: 'Cupom nao encontrado.' };
  await prisma.cupom.delete({ where: { id } });
  return { message: 'Cupom removido com sucesso.' };
}

type ResultadoValidacaoCupom =
  | { valido: true; motivo?: undefined; cupom: { id: string; codigo: string; tipo: string; valor: number }; valorDesconto: number }
  | { valido: false; motivo: string };

export async function validarCupom(input: {
  codigo: string;
  subtotal: number;
  telefoneCliente?: string;
  formaPagamento?: string;
  tipoPedido?: string;
}): Promise<ResultadoValidacaoCupom> {
  const codigo = normalizarCodigo(input.codigo);
  const subtotal = Number(input.subtotal) || 0;

  if (!codigo) return { valido: false, motivo: 'Informe o codigo do cupom.' };

  const cupom = await prisma.cupom.findUnique({ where: { codigo } });
  if (!cupom) return { valido: false, motivo: 'Cupom nao encontrado.' };
  if (!cupom.ativo) return { valido: false, motivo: 'Este cupom nao esta mais ativo.' };

  if (cupom.diasSemana.length > 0 && !cupom.diasSemana.includes(diaDaSemanaBrasiliaAgora())) {
    return { valido: false, motivo: 'Este cupom nao esta disponivel hoje.' };
  }

  if (cupom.somentePix && input.formaPagamento !== 'PIX') {
    return { valido: false, motivo: 'Este cupom e valido apenas para pagamento via PIX (pago na hora, pelo Mercado Pago).' };
  }

  if (cupom.tiposPedido.length > 0 && (!input.tipoPedido || !cupom.tiposPedido.includes(input.tipoPedido))) {
    const nomes: Record<string, string> = { DELIVERY: 'delivery', RETIRADA: 'retirada na loja', LOCAL: 'consumo local' };
    const opcoes = cupom.tiposPedido.map((t) => nomes[t] || t).join(' ou ');
    return { valido: false, motivo: `Este cupom e valido apenas para pedidos de ${opcoes}.` };
  }

  if (cupom.limiteUsos != null && cupom.usosCount >= cupom.limiteUsos) {
    return { valido: false, motivo: 'Este cupom atingiu o limite de usos.' };
  }

  if (cupom.valorMinimoPedido != null && subtotal < cupom.valorMinimoPedido) {
    return {
      valido: false,
      motivo: `Pedido minimo de R$ ${cupom.valorMinimoPedido.toFixed(2)} para usar este cupom.`,
    };
  }

  const telefone = String(input.telefoneCliente || '').replace(/\D/g, '');
  if (cupom.limitePorCliente != null && telefone) {
    const usosCliente = await prisma.pedido.count({
      where: { cupomId: cupom.id, telefoneCliente: input.telefoneCliente },
    });
    if (usosCliente >= cupom.limitePorCliente) {
      return { valido: false, motivo: 'Voce ja usou esse cupom o maximo de vezes permitido.' };
    }
  }

  let valorDesconto = cupom.tipo === 'PERCENTUAL' ? (subtotal * cupom.valor) / 100 : cupom.valor;
  if (cupom.tipo === 'PERCENTUAL' && cupom.descontoMaximo != null) {
    valorDesconto = Math.min(valorDesconto, cupom.descontoMaximo);
  }
  valorDesconto = Math.min(valorDesconto, subtotal);
  valorDesconto = Number(Math.max(valorDesconto, 0).toFixed(2));

  if (valorDesconto <= 0) {
    return { valido: false, motivo: 'Cupom nao gera desconto para este pedido.' };
  }

  return {
    valido: true,
    cupom: { id: cupom.id, codigo: cupom.codigo, tipo: cupom.tipo, valor: cupom.valor },
    valorDesconto,
  };
}

export async function registrarUsoCupom(cupomId: string) {
  await prisma.cupom.update({
    where: { id: cupomId },
    data: { usosCount: { increment: 1 } },
  });
}
