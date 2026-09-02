import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, Check, AlertTriangle, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

type Pedido = {
  id: string;
  numero: number;
  status: string;
  total: number;
  nomeCliente?: string | null;
  enderecoEntrega?: string | null;
  observacoes?: string | null;
  cliente?: { nome: string; telefone: string } | null;
  itens?: Array<{ quantidade: number; variacaoNome?: string | null; produto: { nome: string } }>;
};

const INTERVALO_ENVIO_MS = 15000;

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function EntregadorPage() {
  const queryClient = useQueryClient();
  const [rastreando, setRastreando] = useState<string | null>(null);
  const [ultimoEnvio, setUltimoEnvio] = useState<Date | null>(null);
  const [erroGps, setErroGps] = useState<string | null>(null);

  const watchRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const ultimaPosRef = useRef<GeolocationPosition | null>(null);
  const timerRef = useRef<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["entregas-minhas"],
    queryFn: () => api.get<{ minhas: Pedido[]; disponiveis: Pedido[] }>("/api/entregas/minhas"),
    refetchInterval: 20000,
  });

  const assumir = useMutation({
    mutationFn: (pedidoId: string) => api.post(`/api/entregas/${pedidoId}/assumir`, {}),
    onSuccess: (pedido: any) => {
      queryClient.invalidateQueries({ queryKey: ["entregas-minhas"] });
      toast.success(`Pedido #${pedido.numero} é seu. Boa entrega!`);
      iniciarRastreio(pedido.id);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const concluir = useMutation({
    mutationFn: (pedidoId: string) => api.post(`/api/entregas/${pedidoId}/concluir`, {}),
    onSuccess: (pedido: any) => {
      queryClient.invalidateQueries({ queryKey: ["entregas-minhas"] });
      toast.success(`Pedido #${pedido.numero} entregue`);
      pararRastreio();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const enviarPosicao = async (pedidoId: string, pos: GeolocationPosition) => {
    try {
      await api.post(`/api/entregas/${pedidoId}/posicao`, {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        precisaoM: pos.coords.accuracy,
      });
      setUltimoEnvio(new Date());
      setErroGps(null);
    } catch (err: any) {
      setErroGps(err.message);
    }
  };

  /**
   * Wake lock mantém a tela ligada. É o que segura o rastreio funcionando:
   * com a tela bloqueada o navegador congela o GPS, e isso não tem contorno
   * em web, nem com PWA. Se o aparelho não suportar, seguimos assim mesmo.
   */
  const pedirWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      }
    } catch {
      // Sem wake lock o rastreio continua enquanto a tela estiver acesa.
    }
  };

  const iniciarRastreio = (pedidoId: string) => {
    if (!("geolocation" in navigator)) {
      toast.error("Este aparelho não permite localização pelo navegador.");
      return;
    }
    pararRastreio();
    setRastreando(pedidoId);
    pedirWakeLock();

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => { ultimaPosRef.current = pos; },
      (err) => setErroGps(err.code === err.PERMISSION_DENIED
        ? "Permissão de localização negada. Autorize nas configurações do navegador."
        : "Sem sinal de GPS agora."),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );

    // Envia em intervalo fixo em vez de a cada leitura do GPS: o watchPosition
    // dispara muitas vezes por minuto e não faz sentido gastar rede com isso.
    timerRef.current = setInterval(() => {
      if (ultimaPosRef.current) enviarPosicao(pedidoId, ultimaPosRef.current);
    }, INTERVALO_ENVIO_MS);
  };

  const pararRastreio = () => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (wakeLockRef.current) {
      wakeLockRef.current.release?.();
      wakeLockRef.current = null;
    }
    setRastreando(null);
    setUltimoEnvio(null);
  };

  useEffect(() => pararRastreio, []);

  // Ao voltar para a aba, o wake lock cai e precisa ser pedido de novo.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && rastreando) pedirWakeLock();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [rastreando]);

  const minhas = data?.minhas ?? [];
  const disponiveis = data?.disponiveis ?? [];

  const cartao = (pedido: Pedido, minha: boolean) => (
    <Card key={pedido.id} className="border">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-lg font-bold">#{pedido.numero}</span>
          <Badge variant="outline">{fmt(pedido.total)}</Badge>
        </div>

        <p className="text-sm font-medium">
          {pedido.cliente?.nome ?? pedido.nomeCliente ?? "Sem nome"}
        </p>

        <div className="flex gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{pedido.enderecoEntrega || "Endereço não informado"}</span>
        </div>

        <ul className="space-y-0.5 text-sm">
          {(pedido.itens ?? []).map((item, i) => (
            <li key={i}>
              <span className="font-bold">{item.quantidade}x</span> {item.produto.nome}
              {item.variacaoNome && <span className="text-muted-foreground"> ({item.variacaoNome})</span>}
            </li>
          ))}
        </ul>

        {pedido.observacoes && (
          <p className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
            {pedido.observacoes}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {pedido.enderecoEntrega && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(pedido.enderecoEntrega)}`}
                target="_blank"
                rel="noreferrer"
              >
                <Navigation className="mr-1 h-4 w-4" />
                Rota
              </a>
            </Button>
          )}

          {!minha && (
            <Button size="sm" onClick={() => assumir.mutate(pedido.id)} disabled={assumir.isPending}>
              Iniciar entrega
            </Button>
          )}

          {minha && rastreando !== pedido.id && (
            <Button size="sm" variant="secondary" onClick={() => iniciarRastreio(pedido.id)}>
              Retomar rastreio
            </Button>
          )}

          {minha && (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => concluir.mutate(pedido.id)}
              disabled={concluir.isPending}
            >
              <Check className="mr-1 h-4 w-4" />
              Entreguei
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">Minhas entregas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pegue um pedido e o cliente acompanha você no mapa.
        </p>
      </div>

      {rastreando && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <Wifi className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Rastreio ligado</p>
            <p className="text-xs">
              {ultimoEnvio
                ? `Última posição enviada às ${ultimoEnvio.toLocaleTimeString("pt-BR")}`
                : "Aguardando o primeiro sinal do GPS..."}
            </p>
            <p className="mt-1 text-xs">
              Deixe esta tela aberta. Com o celular bloqueado o rastreio para.
            </p>
          </div>
        </div>
      )}

      {erroGps && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{erroGps}</span>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Comigo agora
              <Badge variant="secondary">{minhas.length}</Badge>
            </h2>
            {minhas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma entrega em rota.</p>
            ) : (
              minhas.map((p) => cartao(p, true))
            )}
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Prontos para sair
              <Badge variant="secondary">{disponiveis.length}</Badge>
            </h2>
            {disponiveis.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <WifiOff className="h-4 w-4" />
                Nada pronto na cozinha por enquanto.
              </p>
            ) : (
              disponiveis.map((p) => cartao(p, false))
            )}
          </section>
        </>
      )}
    </div>
  );
}
