const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agente", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  setConfig: (config) => ipcRenderer.invoke("config:set", config),
  listarImpressoras: () => ipcRenderer.invoke("printers:listar"),
  testarConexao: () => ipcRenderer.invoke("teste:conexao"),
  testarLogin: () => ipcRenderer.invoke("teste:login"),
  testarImpressao: () => ipcRenderer.invoke("teste:imprimir"),
  getStatus: () => ipcRenderer.invoke("status:get"),
  onStatusAtualizado: (callback) => {
    ipcRenderer.on("status-atualizado", (_evt, status) => callback(status));
  },
});
