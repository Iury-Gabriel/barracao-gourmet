const axios = require("axios");
const store = require("./store");

let cachedToken = null;

async function login() {
  const { backendUrl, email, senha } = store.store;
  if (!backendUrl || !email || !senha) {
    throw new Error("Configure a URL do backend, o e-mail e a senha antes de conectar.");
  }
  const res = await axios.post(`${backendUrl}/api/auth/login`, { email, senha }, { timeout: 10000 });
  cachedToken = res.data.token;
  return cachedToken;
}

async function authedRequest(method, path, data) {
  const { backendUrl } = store.store;
  if (!cachedToken) await login();

  const fazer = () =>
    axios({
      method,
      url: `${backendUrl}${path}`,
      data,
      timeout: 15000,
      headers: { Authorization: `Bearer ${cachedToken}` },
    });

  try {
    return await fazer();
  } catch (err) {
    if (err.response?.status === 401) {
      // token expirado/invalido: loga de novo uma vez e tenta de novo
      await login();
      return fazer();
    }
    throw err;
  }
}

async function buscarPedidosParaImprimir() {
  const res = await authedRequest("get", "/api/pedidos/para-imprimir");
  return res.data;
}

async function marcarComoImpresso(id) {
  await authedRequest("patch", `/api/pedidos/${id}/marcar-impresso`);
}

async function testarConexao() {
  const { backendUrl } = store.store;
  const res = await axios.get(`${backendUrl}/api/health`, { timeout: 8000 });
  return res.data;
}

function resetToken() {
  cachedToken = null;
}

module.exports = { login, buscarPedidosParaImprimir, marcarComoImpresso, testarConexao, resetToken };
