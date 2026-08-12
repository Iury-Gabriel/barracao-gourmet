import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { imprimirPedido } from "@/lib/printPedido";

const STORAGE_KEY = "barracao_autoprint_enabled";
const EVENT = "loja-autoprint-changed";

export function isAutoPrintEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAutoPrintEnabled(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: value }));
}

// Estado reativo do flag (para o botao de toggle e para o hook de impressao).
export function useAutoPrintEnabled(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(isAutoPrintEnabled());

  useEffect(() => {
    const sync = () => setEnabled(isAutoPrintEnabled());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return [enabled, setAutoPrintEnabled];
}

// Hook global (montado no layout): enquanto a impressao automatica estiver ligada,
// busca os pedidos e imprime os que chegarem novos. Nao imprime o historico ja existente.
export function useAutoPrintPedidos() {
  const [enabled] = useAutoPrintEnabled();
  const vistosRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  const { data } = useQuery({
    queryKey: ["pedidos", "ativos"],
    queryFn: () => api.get<{ pedidos: any[] }>("/api/pedidos?limit=200"),
    refetchInterval: enabled ? 8000 : false,
    enabled,
  });

  // Ao desligar, reseta a semente para nao imprimir historico ao religar.
  useEffect(() => {
    if (!enabled) {
      seededRef.current = false;
      vistosRef.current = new Set();
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const pedidos = data?.pedidos;
    if (!Array.isArray(pedidos)) return;

    // Primeira leitura desta sessao: marca tudo como visto (nao imprime o que ja existia).
    if (!seededRef.current) {
      pedidos.forEach((p) => p?.id && vistosRef.current.add(p.id));
      seededRef.current = true;
      return;
    }

    const novos = pedidos.filter((p) => p?.id && !vistosRef.current.has(p.id));
    if (novos.length === 0) return;

    // Imprime do mais antigo para o mais novo (a lista vem do mais novo para o mais antigo).
    [...novos].reverse().forEach((pedido) => {
      vistosRef.current.add(pedido.id);
      imprimirPedido(pedido);
    });
  }, [data, enabled]);
}
