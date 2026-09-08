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
  VALE: "Vale refeicao",
};

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// O troco e gravado dentro do texto de observacoes pelo cardapio.service, no
// formato "Troco: sim (levar para R$ 100.00)." ou "Troco: nao.". A impressao
// precisa destacar isso separado do resto, entao o valor e lido dali em vez de
// virar campo novo no banco: o texto e gerado pelo proprio sistema, entao o
// formato e estavel, e assim os pedidos ja existentes tambem saem certos.
function extrairTroco(observacoes?: string): { precisa: boolean; para: number } | null {
  if (!observacoes) return null;
  const m = observacoes.match(/Troco:\s*(sim|nao)(?:\s*\(levar para R\$\s*([\d.]+)\))?/i);
  if (!m) return null;
  if (m[1].toLowerCase() === "nao") return { precisa: false, para: 0 };
  return { precisa: true, para: m[2] ? Number(m[2]) : 0 };
}

// Tira do bloco OBS o que ja aparece destacado em outro lugar do cupom.
function limparObservacoes(observacoes?: string): string {
  if (!observacoes) return "";
  return observacoes
    .split("|")
    .map((parte) => parte.trim())
    .filter((parte) => parte && !/^Troco:/i.test(parte) && !/^Mercado Pago /i.test(parte))
    .join(" | ");
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

  const observacoesLimpas = limparObservacoes(pedido?.observacoes);
  const obs = observacoesLimpas
    ? `<div class="sec"><div class="lbl">OBS</div><div>${escapeHtml(observacoesLimpas)}</div></div>`
    : "";

  // Alergia nao pode passar batido no meio das observacoes: sai em bloco proprio.
  const alergia = (pedido?.observacoes || "").match(/ALERGIA:\s*([^|]+)/i);
  const seloAlergia = alergia
    ? `<div class="selo-alergia">ALERGIA<div class="selo-alergia-val">${escapeHtml(alergia[1].trim())}</div></div>`
    : "";

  const pago = pedido?.statusPagamento === "PAGO";
  const troco = extrairTroco(pedido?.observacoes);
  // Quanto o entregador precisa levar de volta. So faz sentido se o cliente
  // disse para quanto quer o troco e esse valor cobre o pedido.
  const levarDeTroco = troco?.precisa && troco.para > total ? troco.para - total : 0;

  // Os dois selos sao propositalmente diferentes: pago e uma confirmacao
  // (moldura), troco e uma acao para o entregador (invertido, chama mais).
  const seloPagamento = pago
    ? `<div class="selo-pago">PEDIDO PAGO<div class="selo-sub">NAO COBRAR NA ENTREGA</div></div>`
    : "";

  const seloTroco = troco?.precisa
    ? `<div class="selo-troco">
         <div class="selo-troco-tit">LEVAR TROCO</div>
         <div class="selo-troco-val">${levarDeTroco > 0 ? brl(levarDeTroco) : "CONFERIR"}</div>
         <div class="selo-troco-sub">Cliente paga com ${troco.para > 0 ? brl(troco.para) : "valor nao informado"}</div>
       </div>`
    : troco && !troco.precisa
      ? `<div class="sec"><div class="lbl">TROCO</div><div>Nao precisa de troco.</div></div>`
      : "";

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
    .selo-pago { border: 3px double #000; text-align: center; font-size: 15px; font-weight: 700; padding: 4px 2px; margin: 6px 0; }
    .selo-pago .selo-sub { font-size: 10px; font-weight: 700; letter-spacing: 0.5px; }
    .selo-troco { background: #000; color: #fff; text-align: center; padding: 5px 2px; margin: 6px 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .selo-troco-tit { font-size: 11px; font-weight: 700; letter-spacing: 1px; }
    .selo-troco-val { font-size: 20px; font-weight: 700; line-height: 1.1; }
    .selo-troco-sub { font-size: 10px; }
    .selo-alergia { border: 3px solid #000; text-align: center; padding: 4px 2px; margin: 6px 0; font-size: 12px; font-weight: 700; letter-spacing: 1px; }
    .selo-alergia-val { font-size: 15px; letter-spacing: 0; }
    .selo-alterado { background: #000; color: #fff; text-align: center; padding: 5px 2px; margin: 0 0 6px; font-size: 15px; font-weight: 700; letter-spacing: 1px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .selo-alterado-sub { font-size: 10px; font-weight: 400; letter-spacing: 0; }
  </style></head>
  <body>
    <div class="cupom">
      ${pedido?.alteradoEm ? `<div class="selo-alterado">PEDIDO ALTERADO<div class="selo-alterado-sub">Descarte o cupom anterior deste pedido</div></div>` : ""}
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
        <div>${PAGAMENTO_LABEL[pedido?.pagamento] || pedido?.pagamento || "-"}</div>
      </div>
      ${seloPagamento}
      ${seloTroco}
      ${seloAlergia}
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
