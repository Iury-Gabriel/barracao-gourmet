const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require("electron");
const path = require("path");
const store = require("./store");
const api = require("./api");
const printerLib = require("./printer");

const iconPath = path.join(__dirname, "..", "assets", "icon.png");

let mainWindow = null;
let tray = null;
let pollTimer = null;
let statusAtual = { conectado: false, ultimaChecagem: null, ultimoErro: null, ultimoPedidoImpresso: null };

// So permite uma instancia do app rodando por vez.
const travaInstanciaUnica = app.requestSingleInstanceLock();
if (!travaInstanciaUnica) {
  app.quit();
} else {
  app.on("second-instance", () => {
    abrirJanela();
  });
}

function enviarStatusParaJanela() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("status-atualizado", statusAtual);
  }
  atualizarTray();
}

function atualizarTray() {
  if (!tray) return;
  const label = statusAtual.conectado ? "Conectado - monitorando pedidos" : "Desconectado";
  tray.setToolTip(`Barracão Gourmet - Impressora\n${label}`);
  tray.setContextMenu(construirMenuTray());
}

function construirMenuTray() {
  return Menu.buildFromTemplate([
    { label: statusAtual.conectado ? "🟢 Conectado" : "🔴 Desconectado", enabled: false },
    { type: "separator" },
    { label: "Abrir configurações", click: abrirJanela },
    { label: "Imprimir teste", click: () => imprimirTesteComFeedback() },
    { label: "Verificar pedidos agora", click: () => checarPedidosPendentes(true) },
    { type: "separator" },
    { label: "Sair", click: () => { app.isQuiting = true; app.quit(); } },
  ]);
}

async function imprimirTesteComFeedback() {
  try {
    await printerLib.imprimirTeste();
  } catch (err) {
    statusAtual.ultimoErro = `Falha no teste de impressao: ${err.message}`;
    enviarStatusParaJanela();
  }
}

function abrirJanela() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 480,
    height: 640,
    resizable: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  mainWindow.on("close", (event) => {
    // Minimiza pra bandeja em vez de fechar, pra continuar monitorando em segundo plano.
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.once("did-finish-load", () => {
    enviarStatusParaJanela();
  });
}

let checagemEmAndamento = false;

async function checarPedidosPendentes(manual = false) {
  // Evita rodar duas checagens ao mesmo tempo: se uma impressao travar
  // (ex: impressora configurada errada abrindo dialogo do Windows pedindo
  // pra salvar o PDF), sem essa trava a proxima checagem (poucos segundos
  // depois) pegaria o mesmo pedido - que ainda nao foi marcado como impresso -
  // e mandaria imprimir de novo, abrindo mais um dialogo, e assim por diante.
  if (checagemEmAndamento) return;
  checagemEmAndamento = true;

  statusAtual.ultimaChecagem = new Date().toISOString();
  try {
    const pedidos = await api.buscarPedidosParaImprimir();
    statusAtual.conectado = true;
    statusAtual.ultimoErro = null;

    for (const pedido of pedidos) {
      try {
        await printerLib.imprimirPedido(pedido);
        await api.marcarComoImpresso(pedido.id);
        statusAtual.ultimoPedidoImpresso = { numero: pedido.numero, hora: new Date().toISOString() };
      } catch (errImpressao) {
        // Nao marca como impresso se a impressao falhou - tenta de novo na proxima checagem.
        statusAtual.ultimoErro = `Falha ao imprimir pedido #${pedido.numero}: ${errImpressao.message}`;
        console.error(statusAtual.ultimoErro);
        break; // evita tentar os proximos pedidos se a impressora esta com problema
      }
    }
  } catch (err) {
    statusAtual.conectado = false;
    statusAtual.ultimoErro = err.response?.data?.error || err.message;
    api.resetToken();
  } finally {
    checagemEmAndamento = false;
  }
  enviarStatusParaJanela();
}

function iniciarPolling() {
  if (pollTimer) clearInterval(pollTimer);
  const segundos = Math.max(store.get("pollIntervalSeconds") || 5, 3);
  pollTimer = setInterval(() => checarPedidosPendentes(false), segundos * 1000);
  checarPedidosPendentes(false); // checa imediatamente ao iniciar
}

// ===== IPC (comunicacao com a janela de configuracoes) =====

ipcMain.handle("config:get", () => store.store);

ipcMain.handle("config:set", (_evt, novaConfig) => {
  for (const [chave, valor] of Object.entries(novaConfig)) {
    store.set(chave, valor);
  }
  api.resetToken();
  aplicarAutoStart();
  iniciarPolling();
  return store.store;
});

ipcMain.handle("printers:listar", async () => {
  if (!mainWindow) return [];
  const impressoras = await mainWindow.webContents.getPrintersAsync();
  return impressoras.map((p) => p.name);
});

ipcMain.handle("teste:conexao", async () => {
  try {
    const data = await api.testarConexao();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
});

ipcMain.handle("teste:login", async () => {
  try {
    await api.login();
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.response?.data?.error || err.message };
  }
});

ipcMain.handle("teste:imprimir", async () => {
  try {
    await printerLib.imprimirTeste();
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
});

ipcMain.handle("status:get", () => statusAtual);

function aplicarAutoStart() {
  if (process.platform === "win32" || process.platform === "darwin") {
    app.setLoginItemSettings({
      openAtLogin: !!store.get("autoStart"),
      openAsHidden: true,
    });
  }
}

// ===== Ciclo de vida do app =====

app.whenReady().then(() => {
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  atualizarTray();

  tray.on("click", abrirJanela);

  aplicarAutoStart();
  iniciarPolling();

  // Se ainda nao configurou e-mail/senha/impressora, abre a janela direto pra ajudar no primeiro uso.
  const cfg = store.store;
  if (!cfg.senha || !cfg.printerName) {
    abrirJanela();
  }
});

app.on("window-all-closed", () => {
  // Nao encerra o app: continua rodando na bandeja monitorando pedidos.
});

app.on("before-quit", () => {
  app.isQuiting = true;
});
