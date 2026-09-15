import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { ChefHat, Clock, AlertTriangle, Bike, ShoppingBag, Store, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type ItemPedido = {
  quantidade: number;
  variacaoNome?: string | null;
  produto?: { nome: string } | null;
};

type PedidoCozinha = {
  id: string;
  numero: number;
  status: string;
  tipo: string;
  criadoEm: string;
  alteradoEm?: string | null;
  observacoes?: string | null;
  nomeCliente?: string | null;
  cliente?: { nome: string } | null;
  itens: ItemPedido[];
};

// A cozinha so enxerga ate "Pronto". O que sai para entrega ja e problema do
// balcao e do entregador.
const COLUNAS = [
  { status: "RECEBIDO", titulo: "A fazer", proximo: "EM_PREPARO", acao: "Comecar" },
  { status: "EM_PREPARO", titulo: "Preparando", proximo: "PRONTO", acao: "Pronto" },
  { status: "PRONTO", titulo: "Pronto", proximo: null, acao: null },
] as const;

const TIPO_ICONE: Record<string, typeof Bike> = {
  DELIVERY: Bike,
  RETIRADA: ShoppingBag,
  LOCAL: Store,
};

const TIPO_LABEL: Record<string, string> = {
  DELIVERY: "Entrega",
  RETIRADA: "Retirada",
  LOCAL: "Salao",
};

function formatarEspera(minutos: number) {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas}h${String(resto).padStart(2, '0')}` : `${horas}h`;
}

function minutosDesde(iso: string) {
  const inicio = new Date(iso).getTime();
  if (Number.isNaN(inicio)) return 0;
  return Math.max(0, Math.floor((Date.now() - inicio) / 60000));
}

/**
 * A cor do relogio e o unico jeito de a cozinha ver, de longe, qual pedido
 * furou a fila. Os cortes seguem o tempo medio da casa (30 min de entrega
 * contando a partir das 11h).
 */
function faixaTempo(minutos: number) {
  if (minutos >= 30) return { classe: "bg-red-600 text-white", piscar: true };
  if (minutos >= 15) return { classe: "bg-amber-500 text-black", piscar: false };
  return { classe: "bg-emerald-600 text-white", piscar: false };
}

// A alergia vem dentro do texto livre de observacoes. Na cozinha ela nao pode
// dividir espaco com frete e troco, que nao interessam a quem cozinha.
function separarObservacoes(observacoes?: string | null) {
  const partes = String(observacoes || "")
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);

  const alergia: string[] = [];
  const cozinha: string[] = [];
  for (const parte of partes) {
    if (/^ALERGIA:/i.test(parte)) alergia.push(parte.replace(/^ALERGIA:\s*/i, ""));
    else if (!/^(Frete|Troco|Mercado Pago|Acrescimo)/i.test(parte)) cozinha.push(parte);
  }
  return { alergia, cozinha };
}

export default function CozinhaPage() {
  const queryClient = useQueryClient();
  // Reconta os minutos sem depender de nova resposta do servidor, senao o
  // relogio so andaria a cada recarga.
  const [, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["pedidos-cozinha"],
    queryFn: () => api.get<{ pedidos: PedidoCozinha[]; producao: Array<{ nome: string; quantidade: number }> }>(
      "/api/pedidos/cozinha",
    ),
    refetchInterval: 15000,
  });

  const avancar = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/pedidos/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pedidos-cozinha"] }),
    onError: (err: any) => toast.error(err.message),
  });

  const pedidos = data?.pedidos ?? [];
  const producao = data?.producao ?? [];

  return (
    <div className="min-h-screen bg-background p-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ChefHat className="h-6 w-6" />
          <div>
            <h1 className="text-xl font-bold leading-tight">Cozinha</h1>
            <p className="text-sm text-muted-foreground">
              {pedidos.filter((p) => p.status !== "PRONTO").length} pedido(s) na fila
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </header>

      {/* O que a cozinha mais precisa: quanto falta de cada prato, somado. */}
      {producao.length > 0 && (
        <div className="mb-3 rounded-lg border bg-card p-3">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Falta produzir
          </p>
          <div className="flex flex-wrap gap-2">
            {producao.map((item) => (
              <div
                key={item.nome}
                className="flex items-baseline gap-1.5 rounded border bg-background px-2 py-1"
              >
                <span className="text-lg font-bold tabular-nums">{item.quantidade}</span>
                <span className="text-sm">{item.nome}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="py-16 text-center text-lg text-muted-foreground">Carregando...</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {COLUNAS.map((coluna) => {
            const daColuna = pedidos.filter((p) => p.status === coluna.status);
            return (
              <section key={coluna.status} className="rounded-lg border bg-card/40 p-2">
                <h2 className="mb-2 flex items-center justify-between text-base font-bold">
                  {coluna.titulo}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-sm tabular-nums">
                    {daColuna.length}
                  </span>
                </h2>

                {daColuna.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Nada aqui</p>
                ) : (
                  <div className="space-y-2">
                    {daColuna.map((pedido) => {
                      const minutos = minutosDesde(pedido.criadoEm);
                      const tempo = faixaTempo(minutos);
                      const { alergia, cozinha } = separarObservacoes(pedido.observacoes);
                      const Icone = TIPO_ICONE[pedido.tipo] ?? ShoppingBag;
                      const alterado = Boolean(pedido.alteradoEm);

                      return (
                        <article
                          key={pedido.id}
                          className={`rounded-lg border-2 bg-background p-2.5 ${
                            alergia.length ? "border-red-500" : "border-border"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xl font-bold tabular-nums">#{pedido.numero}</span>
                            <span
                              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-sm font-bold tabular-nums ${tempo.classe} ${
                                tempo.piscar ? "animate-pulse" : ""
                              }`}
                            >
                              <Clock className="h-4 w-4" />
                              {formatarEspera(minutos)}
                            </span>
                          </div>

                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Icone className="h-3.5 w-3.5" />
                            {TIPO_LABEL[pedido.tipo] ?? pedido.tipo}
                            {pedido.nomeCliente || pedido.cliente?.nome ? (
                              <span className="truncate">
                                · {pedido.cliente?.nome ?? pedido.nomeCliente}
                              </span>
                            ) : null}
                          </div>

                          {alterado && (
                            <p className="mt-1.5 rounded bg-foreground px-2 py-0.5 text-center text-xs font-bold uppercase text-background">
                              Pedido alterado
                            </p>
                          )}

                          <ul className="mt-1.5 space-y-0.5">
                            {pedido.itens.map((item, i) => (
                              <li key={i} className="flex gap-1.5 text-base leading-snug">
                                <span className="font-bold tabular-nums">{item.quantidade}x</span>
                                <span>
                                  {item.produto?.nome ?? "Item"}
                                  {item.variacaoNome && (
                                    <span className="text-muted-foreground"> ({item.variacaoNome})</span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>

                          {alergia.length > 0 && (
                            <p className="mt-1.5 flex items-start gap-1.5 rounded bg-red-600 px-2 py-1 text-sm font-bold text-white">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                              ALERGIA: {alergia.join(" · ")}
                            </p>
                          )}

                          {cozinha.length > 0 && (
                            <p className="mt-1.5 rounded bg-amber-100 px-2 py-1 text-sm font-medium text-amber-900">
                              {cozinha.join(" · ")}
                            </p>
                          )}

                          {coluna.proximo && (
                            <Button
                              size="sm"
                              className="mt-2 h-9 w-full text-sm font-bold"
                              disabled={avancar.isPending}
                              onClick={() =>
                                avancar.mutate({ id: pedido.id, status: coluna.proximo! })
                              }
                            >
                              {coluna.acao}
                            </Button>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
