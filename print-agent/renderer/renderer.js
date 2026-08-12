const el = (id) => document.getElementById(id);

function mostrarMensagem(texto, ehErro = false) {
  const msg = el("mensagem");
  msg.textContent = texto;
  msg.className = "mensagem" + (ehErro ? " erro" : "");
  if (texto) {
    setTimeout(() => {
      if (msg.textContent === texto) msg.textContent = "";
    }, 6000);
  }
}

async function carregarImpressoras(selecionarAtual) {
  const select = el("printerName");
  const atual = selecionarAtual ?? select.value;
  const impressoras = await window.agente.listarImpressoras();
  select.innerHTML = "";

  if (impressoras.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Nenhuma impressora encontrada";
    select.appendChild(opt);
    return;
  }

  for (const nome of impressoras) {
    const opt = document.createElement("option");
    opt.value = nome;
    opt.textContent = nome;
    select.appendChild(opt);
  }

  if (atual && impressoras.includes(atual)) {
    select.value = atual;
  }
}

async function carregarConfig() {
  const config = await window.agente.getConfig();
  el("backendUrl").value = config.backendUrl || "";
  el("email").value = config.email || "";
  el("senha").value = config.senha || "";
  el("paperWidthMm").value = String(config.paperWidthMm || 80);
  el("pollIntervalSeconds").value = config.pollIntervalSeconds || 5;
  el("autoStart").checked = !!config.autoStart;
  await carregarImpressoras(config.printerName);
}

function renderStatus(status) {
  const bolinha = el("statusBolinha");
  const texto = el("statusTexto");
  const detalhe = el("statusDetalhe");

  bolinha.className = "status-bolinha " + (status.conectado ? "ok" : "erro");
  texto.textContent = status.conectado ? "Conectado - monitorando pedidos" : "Desconectado do servidor";

  const partes = [];
  if (status.ultimaChecagem) {
    partes.push(`Última checagem: ${new Date(status.ultimaChecagem).toLocaleTimeString("pt-BR")}`);
  }
  if (status.ultimoPedidoImpresso) {
    partes.push(`Último pedido impresso: #${status.ultimoPedidoImpresso.numero}`);
  }
  if (status.ultimoErro) {
    partes.push(`Erro: ${status.ultimoErro}`);
  }
  detalhe.textContent = partes.join(" · ");
}

function configDoFormulario() {
  return {
    backendUrl: el("backendUrl").value.trim().replace(/\/$/, ""),
    email: el("email").value.trim(),
    senha: el("senha").value.trim(),
    printerName: el("printerName").value,
    paperWidthMm: Number(el("paperWidthMm").value) || 80,
    pollIntervalSeconds: Number(el("pollIntervalSeconds").value) || 5,
    autoStart: el("autoStart").checked,
  };
}

// Salva sempre o que esta na tela antes de qualquer teste - assim "Testar login"
// nunca usa dado antigo esquecido, mesmo que a pessoa nao tenha clicado em
// "Salvar configuracoes" antes.
async function salvarConfigAtual() {
  await window.agente.setConfig(configDoFormulario());
}

el("formConfig").addEventListener("submit", async (evt) => {
  evt.preventDefault();
  await salvarConfigAtual();
  mostrarMensagem("Configurações salvas.");
});

el("btnAtualizarImpressoras").addEventListener("click", () => carregarImpressoras());

el("btnTestarConexao").addEventListener("click", async () => {
  mostrarMensagem("Testando conexão...");
  await salvarConfigAtual();
  const resultado = await window.agente.testarConexao();
  if (resultado.ok) mostrarMensagem("Conexão com o servidor OK.");
  else mostrarMensagem(`Falha na conexão: ${resultado.erro}`, true);
});

el("btnTestarLogin").addEventListener("click", async () => {
  mostrarMensagem("Testando login...");
  await salvarConfigAtual();
  const resultado = await window.agente.testarLogin();
  if (resultado.ok) mostrarMensagem("Login OK.");
  else mostrarMensagem(`Falha no login: ${resultado.erro}`, true);
});

el("btnTestarImpressao").addEventListener("click", async () => {
  mostrarMensagem("Enviando impressão de teste...");
  await salvarConfigAtual();
  const resultado = await window.agente.testarImpressao();
  if (resultado.ok) mostrarMensagem("Impressão de teste enviada.");
  else mostrarMensagem(`Falha ao imprimir: ${resultado.erro}`, true);
});

window.agente.onStatusAtualizado(renderStatus);

(async () => {
  await carregarConfig();
  const status = await window.agente.getStatus();
  renderStatus(status);
})();
