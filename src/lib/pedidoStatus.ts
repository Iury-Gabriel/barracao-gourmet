export const NEXT_PEDIDO_STATUS: Record<string, string> = {
  RECEBIDO: "EM_PREPARO",
  EM_PREPARO: "PRONTO",
  PRONTO: "EM_ENTREGA",
  EM_ENTREGA: "ENTREGUE",
};

export function getNextPedidoStatus(pedido: { status?: string; tipo?: string } | null | undefined) {
  if (pedido?.tipo === "RETIRADA" && pedido?.status === "PRONTO") {
    return "ENTREGUE";
  }

  return NEXT_PEDIDO_STATUS[pedido?.status || ""] || "";
}

export function getNextPedidoStatusLabel(
  pedido: { status?: string; tipo?: string } | null | undefined,
  labels: Record<string, { label: string }>,
) {
  const nextStatus = getNextPedidoStatus(pedido);
  if (!nextStatus) return "";

  if (pedido?.tipo === "RETIRADA" && pedido?.status === "PRONTO" && nextStatus === "ENTREGUE") {
    return "Marcar como retirado";
  }

  return `Avançar → ${labels[nextStatus]?.label ?? nextStatus}`;
}

export function getAvailablePedidoStatus(
  pedido: { status?: string; tipo?: string } | null | undefined,
  allStatuses: string[],
) {
  return allStatuses.filter((status) => {
    if (!status || status === pedido?.status || status === "CANCELADO") {
      return false;
    }

    if (pedido?.tipo === "RETIRADA" && status === "EM_ENTREGA") {
      return false;
    }

    return true;
  });
}
