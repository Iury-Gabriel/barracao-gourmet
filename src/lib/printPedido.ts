// Impressao de cupom de pedido pelo navegador (impressora termica EPSON TM-T20X via USB no Windows).
// Para imprimir sem o dialogo a cada pedido, rode o Chrome com a flag --kiosk-printing
// e deixe a EPSON como impressora padrao do Windows. Sem isso, abre o dialogo de impressao.

function brl(v: number) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataHora(valor?: string) {
  const d = valor ? new Date(valor) : new Date();
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const TIPO_LABEL: Record<string, string> = { DELIVERY: "DELIVERY", RETIRADA: "RETIRADA", LOCAL: "LOCAL" };
const PAGAMENTO_LABEL: Record<string, string> = {
  PIX: "PIX",
  CARTAO_CREDITO: "Cartao de credito",
  CARTAO_DEBITO: "Cartao de debito",
  DINHEIRO: "Dinheiro",
  PAGAR_NA_ENTREGA: "Pagar na entrega",
  PENDENTE: "Pendente",
};

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function montarHtmlCupom(pedido: any): string {
  const itens: any[] = Array.isArray(pedido?.itens) ? pedido.itens : [];
  const subtotalProdutos = itens.reduce((acc, i) => acc + Number(i?.subtotal || 0), 0);
  const total = Number(pedido?.total || 0);
  const isDelivery = pedido?.tipo === "DELIVERY";
  const frete = isDelivery ? Math.max(0, Number((total - subtotalProdutos).toFixed(2))) : 0;

  const linhasItens = itens
    .map((i) => {
      const nome = escapeHtml(i?.produto?.nome || i?.nome || "Item");
      const sabor = i?.variacaoNome ? ` (${escapeHtml(i.variacaoNome)})` : "";
      const qtd = Number(i?.quantidade || 0);
      const sub = brl(Number(i?.subtotal || 0));
      return `<div class="item"><span class="qtd">${qtd}x</span> <span class="nome">${nome}${sabor}</span><span class="val">${sub}</span></div>`;
    })
    .join("");

  const enderecoBloco = isDelivery
    ? `<div class="sec"><div class="lbl">ENTREGA</div>
        <div>${escapeHtml(pedido?.enderecoEntrega || "Endereco nao informado")}</div>
        ${pedido?.cepEntrega ? `<div>CEP: ${escapeHtml(pedido.cepEntrega)}</div>` : ""}
      </div>`
    : `<div class="sec"><div class="lbl">RETIRADA NO BALCAO</div></div>`;

  const obs = pedido?.observacoes ? `<div class="sec"><div class="lbl">OBS</div><div>${escapeHtml(pedido.observacoes)}</div></div>` : "";

  return `<!doctype html><html><head><meta charset="utf-8" />
  <style>
    @page { size: 72mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { width: 72mm; font-family: 'Courier New', monospace; color: #000; }
    .cupom { padding: 4mm 3mm 8mm; font-size: 12px; line-height: 1.35; }
    .center { text-align: center; }
    .titulo { font-size: 16px; font-weight: 700; }
    .num { font-size: 20px; font-weight: 700; }
    .hr { border-top: 1px dashed #000; margin: 6px 0; }
    .sec { margin: 4px 0; }
    .lbl { font-weight: 700; font-size: 11px; }
    .item { display: flex; gap: 4px; }
    .item .qtd { font-weight: 700; }
    .item .nome { flex: 1; }
    .item .val { white-space: nowrap; }
    .tot { display: flex; justify-content: space-between; }
    .tot.grande { font-size: 15px; font-weight: 700; }
  </style></head>
  <body>
    <div class="cupom">
      <div class="center titulo">BARRACAO GOURMET</div>
      <div class="center num">PEDIDO #${escapeHtml(String(pedido?.numero ?? ""))}</div>
      <div class="center">${dataHora(pedido?.criadoEm)}</div>
      <div class="center">${TIPO_LABEL[pedido?.tipo] || pedido?.tipo || ""}${pedido?.origem ? " - " + escapeHtml(String(pedido.origem)) : ""}</div>
      <div class="hr"></div>
      <div class="sec">
        <div class="lbl">CLIENTE</div>
        <div>${escapeHtml(pedido?.nomeCliente || pedido?.cliente?.nome || "Nao informado")}</div>
        ${pedido?.telefoneCliente ? `<div>Tel: ${escapeHtml(pedido.telefoneCliente)}</div>` : ""}
      </div>
      ${enderecoBloco}
      <div class="hr"></div>
      <div class="sec">
        <div class="lbl">ITENS</div>
        ${linhasItens || "<div>(sem itens)</div>"}
      </div>
      <div class="hr"></div>
      <div class="tot"><span>Subtotal</span><span>${brl(subtotalProdutos)}</span></div>
      ${isDelivery ? `<div class="tot"><span>Frete</span><span>${brl(frete)}</span></div>` : ""}
      <div class="tot grande"><span>TOTAL</span><span>${brl(total)}</span></div>
      <div class="hr"></div>
      <div class="sec">
        <div class="lbl">PAGAMENTO</div>
        <div>${PAGAMENTO_LABEL[pedido?.pagamento] || pedido?.pagamento || "-"}${pedido?.statusPagamento === "PAGO" ? " (PAGO)" : ""}</div>
      </div>
      ${obs}
      <div class="hr"></div>
      <div class="center">Obrigado!</div>
    </div>
  </body></html>`;
}

// Imprime o cupom usando um iframe oculto (nao abre nova aba).
export function imprimirPedido(pedido: any) {
  const html = montarHtmlCupom(pedido);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow!;
  const acionar = () => {
    try {
      win.focus();
      win.print();
    } finally {
      // Remove o iframe depois de um tempo (apos o dialogo/spool).
      window.setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 2000);
    }
  };

  // Garante que o conteudo carregou antes de imprimir.
  if (doc.readyState === "complete") {
    window.setTimeout(acionar, 150);
  } else {
    win.addEventListener("load", () => window.setTimeout(acionar, 150));
  }
}
