const Store = require("electron-store");

// Guarda a configuracao localmente (URL do backend, login, nome da impressora).
// encryptionKey so ofusca o arquivo em disco (nao e seguranca forte), suficiente
// para nao deixar a senha em texto puro visivel num editor de texto qualquer.
const store = new Store({
  name: "config",
  encryptionKey: "barracao-gourmet-print-agent-v1",
  defaults: {
    backendUrl: "https://api.barracaogourmet.com.br",
    email: "impressora@barracaogourmet.local",
    senha: "",
    printerName: "",
    paperWidthMm: 80,
    pollIntervalSeconds: 5,
    autoStart: true,
  },
});

module.exports = store;
