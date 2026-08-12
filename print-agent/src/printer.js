const fs = require("fs");
const os = require("os");
const path = require("path");
const PDFDocument = require("pdfkit");
const { print: printFile } = require("pdf-to-printer");
const store = require("./store");

const TIPO_LABEL = { DELIVERY: "ENTREGA", RETIRADA: "RETIRADA NO BALCAO", LOCAL: "CONSUMO LOCAL" };
const PAGAMENTO_LABEL = {
  PENDENTE: "A definir",
  PIX: "PIX",
  CARTAO_CREDITO: "Cartao de credito (online)",
  CARTAO_DEBITO: "Cartao de debito",
  DINHEIRO: "Dinheiro",
  PAGAR_NA_ENTREGA: "Pagar na entrega",
};

// 1mm = 2.8346 pt. Largura util e um pouco menor que o rolo (margens da impressora).
const MM_PARA_PT = 2.8346;

function larguraPaginaPt() {
  const larguraMm = Number(store.get("paperWidthMm")) || 80;
  return larguraMm * MM_PARA_PT;
}

function fmtMoeda(v) {
  return `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;
}

function fmtData(iso) {
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return String(iso || "");
  }
}

function linha(doc, largura) {
  doc.moveDown(0.15);
  doc
    .save()
    .lineWidth(0.6)
    .dash(1, { space: 1 })
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(largura - doc.page.margins.right, doc.y)
    .stroke()
    .undash()
    .restore();
  doc.moveDown(0.3);
}

function linhaDuasColunas(doc, esquerda, direita, largura) {
  const y = doc.y;
  const larguraUtil = largura - doc.page.margins.left - doc.page.margins.right;
  const larguraEsq = larguraUtil * 0.62;
  const larguraDir = larguraUtil * 0.38;
  doc.text(esquerda, doc.page.margins.left, y, { width: larguraEsq });
  const yAposEsquerda = doc.y;
  doc.text(direita, doc.page.margins.left + larguraEsq, y, { width: larguraDir, align: "right" });
  // Volta o cursor pra margem esquerda e desce ate depois da coluna mais alta
  // (uma das duas pode ter quebrado em mais de uma linha), senao o proximo
  // texto "solto" (sem x/y explicitos) herda a posicao x da coluna direita.
  doc.x = doc.page.margins.left;
  doc.y = Math.max(yAposEsquerda, doc.y);
}

function montarPdf(pedido) {
  return new Promise((resolve, reject) => {
    const largura = larguraPaginaPt();
    // Altura generosa (~317mm) pra caber pedidos com varios itens sem cortar.
    // Se um pedido gigante ultrapassar isso, o PDFKit quebra pagina automaticamente
    // (a impressora so continua no papel seguinte) - nao trava nem corta o cupom.
    const doc = new PDFDocument({
      size: [largura, 900],
      margins: { top: 14, bottom: 14, left: 10, right: 10 },
      autoFirstPage: true,
    });

    const nomeArquivo = path.join(os.tmpdir(), `loja-pedido-${pedido.numero}-${Date.now()}.pdf`);
    const stream = fs.createWriteStream(nomeArquivo);
    doc.pipe(stream);

    const fonteNormal = "Helvetica";
    const fonteNegrito = "Helvetica-Bold";

    doc.font(fonteNegrito).fontSize(15).text("BARRACAO GOURMET", { align: "center" });
    doc.font(fonteNormal).fontSize(11).text(`Pedido #${pedido.numero}`, { align: "center" });
    linha(doc, largura);

    doc.fontSize(9);
    doc.text(`Data: ${fmtData(pedido.criadoEm)}`);
    doc.text(`Tipo: ${TIPO_LABEL[pedido.tipo] || pedido.tipo}`);
    doc.moveDown(0.4);

    doc.font(fonteNegrito).text("CLIENTE");
    doc.font(fonteNormal);
    doc.text(pedido.nomeCliente || pedido.cliente?.nome || "Nao informado");
    if (pedido.telefoneCliente) doc.text(`Tel: ${pedido.telefoneCliente}`);
    if (pedido.tipo === "DELIVERY" && pedido.enderecoEntrega) {
      doc.text(`Endereco: ${pedido.enderecoEntrega}`);
      if (pedido.cepEntrega) doc.text(`CEP: ${pedido.cepEntrega}`);
    }
    linha(doc, largura);

    doc.font(fonteNegrito).text("ITENS");
    doc.font(fonteNormal);
    for (const item of pedido.itens || []) {
      const nome = item.produto?.nome || "Produto";
      const variacao = item.variacaoNome ? ` (${item.variacaoNome})` : "";
      doc.text(`${item.quantidade}x ${nome}${variacao}`);
      linhaDuasColunas(doc, `   ${fmtMoeda(item.precoUnit)} un.`, fmtMoeda(item.subtotal), largura);
      doc.moveDown(0.15);
    }
    linha(doc, largura);

    if (pedido.cupomCodigo && Number(pedido.descontoCupom) > 0) {
      linhaDuasColunas(doc, `Cupom (${pedido.cupomCodigo})`, `-${fmtMoeda(pedido.descontoCupom)}`, largura);
      doc.moveDown(0.3);
    }

    doc.font(fonteNegrito).fontSize(13);
    linhaDuasColunas(doc, "TOTAL", fmtMoeda(pedido.total), largura);
    doc.font(fonteNormal).fontSize(9);
    doc.moveDown(0.5);

    doc.text(`Pagamento: ${PAGAMENTO_LABEL[pedido.pagamento] || pedido.pagamento || "-"}`);
    if (pedido.pagamento === "PAGAR_NA_ENTREGA" && pedido.pagamentoEntregaMetodo) {
      doc.text(`  (${PAGAMENTO_LABEL[pedido.pagamentoEntregaMetodo] || pedido.pagamentoEntregaMetodo})`);
    }
    doc.text(`Status pagamento: ${pedido.statusPagamento === "PAGO" ? "PAGO" : "AGUARDANDO"}`);

    if (pedido.observacoes) {
      linha(doc, largura);
      doc.font(fonteNegrito).text("OBSERVACOES");
      doc.font(fonteNormal).text(pedido.observacoes);
    }

    doc.moveDown(0.6);
    doc.fontSize(8).text("--- Barracão Gourmet ---", { align: "center" });

    doc.end();
    stream.on("finish", () => resolve(nomeArquivo));
    stream.on("error", reject);
  });
}

async function imprimirArquivo(nomeArquivo) {
  const { printerName } = store.store;
  if (!printerName) throw new Error("Nome da impressora nao configurado. Abra as configuracoes e selecione a impressora.");
  try {
    await printFile(nomeArquivo, { printer: printerName });
  } finally {
    fs.unlink(nomeArquivo, () => {});
  }
}

async function imprimirPedido(pedido) {
  const nomeArquivo = await montarPdf(pedido);
  await imprimirArquivo(nomeArquivo);
}

async function imprimirTeste() {
  const pedidoFake = {
    numero: "TESTE",
    criadoEm: new Date().toISOString(),
    tipo: "DELIVERY",
    nomeCliente: "Cliente de teste",
    telefoneCliente: "(11) 90000-0000",
    enderecoEntrega: "Rua de teste, 123",
    cepEntrega: "00000-000",
    itens: [{ quantidade: 1, precoUnit: 10, subtotal: 10, produto: { nome: "Produto de teste" } }],
    total: 10,
    pagamento: "PIX",
    statusPagamento: "PAGO",
    observacoes: "Este e um cupom de teste do agente de impressao.",
  };
  await imprimirPedido(pedidoFake);
}

module.exports = { imprimirPedido, imprimirTeste };
