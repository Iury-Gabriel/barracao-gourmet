import type { Lead } from "@/data/mockData";
import { getConversasEnriquecidas } from "@/data/mockData";

export interface TimeIndicators {
  tempoAtePrimeiraResposta: number;
  tempoAteDecisor: number;
  tempoAteReuniao: number;
}

export function computeTimeIndicators(leads: Lead[]): TimeIndicators {
  const conversas = getConversasEnriquecidas(leads);

  // Tempo médio até primeira resposta (horas)
  const temposResposta: number[] = [];
  conversas.forEach((conversa) => {
    const primeiroOutbound = conversa.mensagens.find((m) => m.remetente !== "lead");
    const primeiroInbound = conversa.mensagens.find((m) => m.remetente === "lead");
    if (primeiroOutbound && primeiroInbound) {
      const parseTs = (ts: string) => {
        const [datePart, timePart] = ts.split(" ");
        const [d, mo, y] = datePart.split("/").map(Number);
        const [h, mi] = timePart.split(":").map(Number);
        return new Date(y, mo - 1, d, h, mi).getTime();
      };
      const diffMs = parseTs(primeiroInbound.timestamp) - parseTs(primeiroOutbound.timestamp);
      if (diffMs > 0) temposResposta.push(diffMs / (1000 * 60 * 60));
    }
  });
  const tempoAtePrimeiraResposta = temposResposta.length > 0
    ? Math.round((temposResposta.reduce((s, t) => s + t, 0) / temposResposta.length) * 10) / 10
    : 0;

  // Tempo médio até Decisor (dias)
  const temposDecisor: number[] = [];
  leads.forEach((lead) => {
    const eventoDecisor = lead.timelineEvents.find(
      (e) => e.tipo === "status_change" && e.descricao.toLowerCase().includes("decisor")
    );
    if (eventoDecisor) {
      const diffDias = (new Date(eventoDecisor.timestamp).getTime() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (diffDias > 0) temposDecisor.push(diffDias);
    }
  });
  const tempoAteDecisor = temposDecisor.length > 0
    ? Math.round((temposDecisor.reduce((s, t) => s + t, 0) / temposDecisor.length) * 10) / 10
    : 0;

  // Tempo médio até Reunião (dias)
  const temposReuniao: number[] = [];
  leads.forEach((lead) => {
    const eventoReuniao = lead.timelineEvents.find(
      (e) => e.tipo === "status_change" && e.descricao.toLowerCase().includes("reunião marcada")
    );
    if (eventoReuniao) {
      const diffDias = (new Date(eventoReuniao.timestamp).getTime() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (diffDias > 0) temposReuniao.push(diffDias);
    }
  });
  const tempoAteReuniao = temposReuniao.length > 0
    ? Math.round((temposReuniao.reduce((s, t) => s + t, 0) / temposReuniao.length) * 10) / 10
    : 0;

  return { tempoAtePrimeiraResposta, tempoAteDecisor, tempoAteReuniao };
}

/** Compute average days spent per automation status from timeline events */
export function computeTempoMedioPorEtapa(leads: Lead[]): Record<string, number> {
  const temposPorStatus: Record<string, number[]> = {};

  leads.forEach((lead) => {
    const statusEvents = lead.timelineEvents
      .filter((e) => e.tipo === "status_change")
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Include initial status from createdAt
    const transitions: { status: string; timestamp: number }[] = [
      { status: "NOVO_LEAD", timestamp: new Date(lead.createdAt).getTime() },
    ];

    statusEvents.forEach((e) => {
      // Try to extract status from description
      const desc = e.descricao;
      // Common patterns: "Status → FUP_24H", "Mudou para FUP_24H", "decisor identificado", "reunião marcada"
      const match = desc.match(/→\s*(\w+)/);
      if (match) {
        transitions.push({ status: match[1], timestamp: new Date(e.timestamp).getTime() });
      }
    });

    for (let i = 0; i < transitions.length - 1; i++) {
      const status = transitions[i].status;
      const days = (transitions[i + 1].timestamp - transitions[i].timestamp) / (1000 * 60 * 60 * 24);
      if (days > 0) {
        if (!temposPorStatus[status]) temposPorStatus[status] = [];
        temposPorStatus[status].push(days);
      }
    }
  });

  const result: Record<string, number> = {};
  for (const [status, tempos] of Object.entries(temposPorStatus)) {
    result[status] = Math.round((tempos.reduce((s, t) => s + t, 0) / tempos.length) * 10) / 10;
  }
  return result;
}
