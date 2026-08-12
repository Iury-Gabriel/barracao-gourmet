import { prisma } from '../lib/prisma';
import * as whatsappService from './whatsapp.service';

export async function listarConversas(filtros: {
  tipo?: string;
  busca?: string;
}) {
  const { tipo, busca } = filtros;

  const whereInstancia: any = {};
  if (tipo) whereInstancia.tipo = tipo;

  const instancias = await prisma.instanciaWhatsApp.findMany({
    where: whereInstancia,
    select: { id: true, nome: true, tipo: true },
  });

  const instanciaIds = instancias.map((i) => i.id);
  if (!instanciaIds.length) return [];

  const instanciaMap = new Map(instancias.map((i) => [i.id, i]));

  const mensagens = await prisma.mensagemIA.findMany({
    where: { instanciaId: { in: instanciaIds } },
    distinct: ['remetente', 'instanciaId'],
    orderBy: { criadoEm: 'desc' },
    select: {
      remetente: true,
      instanciaId: true,
      conteudo: true,
      criadoEm: true,
    },
  });

  const conversas = await Promise.all(
    mensagens.map(async (m) => {
      const total = await prisma.mensagemIA.count({
        where: { instanciaId: m.instanciaId, remetente: m.remetente },
      });

      const cliente = await prisma.cliente.findFirst({
        where: {
          telefone: { contains: m.remetente.slice(-8) },
        },
        select: { id: true, nome: true, telefone: true },
      });

      const instancia = instanciaMap.get(m.instanciaId);

      return {
        remetente: m.remetente,
        instanciaId: m.instanciaId,
        instanciaNome: instancia?.nome || '',
        instanciaTipo: instancia?.tipo || '',
        ultimaMensagem: m.conteudo.slice(0, 100),
        ultimaData: m.criadoEm,
        totalMensagens: total,
        clienteNome: cliente?.nome || null,
        clienteId: cliente?.id || null,
      };
    })
  );

  if (busca) {
    const termo = busca.toLowerCase();
    return conversas.filter(
      (c) =>
        c.remetente.includes(termo) ||
        (c.clienteNome && c.clienteNome.toLowerCase().includes(termo))
    );
  }

  return conversas;
}

export async function listarMensagens(
  instanciaId: string,
  remetente: string,
  page = 1,
  limit = 50
) {
  const [mensagens, total, iaPausada] = await Promise.all([
    prisma.mensagemIA.findMany({
      where: { instanciaId, remetente },
      orderBy: { criadoEm: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.mensagemIA.count({ where: { instanciaId, remetente } }),
    isIaPausada(instanciaId, remetente),
  ]);

  return { mensagens, total, page, limit, iaPausada };
}

export async function limparHistorico(instanciaId: string, remetente: string) {
  const resultado = await prisma.mensagemIA.deleteMany({
    where: { instanciaId, remetente },
  });
  return { apagadas: resultado.count };
}

export async function isIaPausada(instanciaId: string, remetente: string) {
  const registro = await prisma.atendimentoIa.findUnique({
    where: { instanciaId_remetente: { instanciaId, remetente } },
    select: { iaPausada: true },
  });
  return Boolean(registro?.iaPausada);
}

export async function definirPausaIa(
  instanciaId: string,
  remetente: string,
  pausar: boolean
) {
  const registro = await prisma.atendimentoIa.upsert({
    where: { instanciaId_remetente: { instanciaId, remetente } },
    update: { iaPausada: pausar, pausadoEm: pausar ? new Date() : null },
    create: { instanciaId, remetente, iaPausada: pausar, pausadoEm: pausar ? new Date() : null },
  });

  return { iaPausada: registro.iaPausada, pausadoEm: registro.pausadoEm };
}

export async function enviarMensagemManual(
  instanciaId: string,
  remetente: string,
  texto: string
) {
  const enviado = await whatsappService.enviarMensagem(instanciaId, remetente, texto);

  if (!enviado) {
    throw { status: 500, message: 'Falha ao enviar mensagem via WhatsApp.' };
  }

  const mensagem = await prisma.mensagemIA.create({
    data: {
      instanciaId,
      remetente,
      conteudo: texto,
      resposta: null,
      tipo: 'TEXTO',
      origem: 'MANUAL',
    },
  });

  return mensagem;
}

export async function enviarMidiaManual(
  instanciaId: string,
  remetente: string,
  tipo: 'IMAGEM' | 'AUDIO',
  url: string,
  caption?: string,
) {
  const enviado =
    tipo === 'AUDIO'
      ? await whatsappService.enviarAudio(instanciaId, remetente, url)
      : await whatsappService.enviarImagem(instanciaId, remetente, url, caption);

  if (!enviado) {
    throw { status: 500, message: `Falha ao enviar ${tipo === 'AUDIO' ? 'áudio' : 'imagem'} via WhatsApp.` };
  }

  // Guarda a URL (e legenda) no conteudo para exibir no painel.
  const conteudo = [caption?.trim(), url].filter(Boolean).join('\n');

  const mensagem = await prisma.mensagemIA.create({
    data: {
      instanciaId,
      remetente,
      conteudo,
      resposta: null,
      tipo,
      origem: 'MANUAL',
    },
  });

  return mensagem;
}
