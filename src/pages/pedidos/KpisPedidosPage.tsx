import { useQuery } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { ShoppingCart, TrendingUp, Clock, XCircle, Package } from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function KpisPedidosPage() {
  const hoje = new Date().toISOString().split("T")[0];
  const trintaDiasAtras = format(subDays(new Date(), 30), "yyyy-MM-dd");

  const { data: kpis, isLoading } = useQuery({
    queryKey: ["kpis-pedidos"],
    queryFn: () => api.get<any>(`/api/pedidos/kpis?dataInicio=${trintaDiasAtras}&dataFim=${hoje}`),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground animate-pulse">Carregando KPIs...</p>
      </div>
    );
  }

  const origemData = Object.entries(kpis?.porOrigem ?? {}).map(([origem, total]) => ({
    origem: origem === "CARDAPIO_DIGITAL" ? "Cardápio" : origem === "MANUAL" ? "Manual" : origem,
    total,
  }));

  const pagamentoData = Object.entries(kpis?.porPagamento ?? {}).map(([metodo, total]) => ({
    metodo:
      metodo === "PIX" ? "PIX" :
      metodo === "CARTAO_CREDITO" ? "Cartão" :
      metodo === "CARTAO_DEBITO" ? "Débito" :
      metodo === "DINHEIRO" ? "Dinheiro" :
      metodo === "PAGAR_NA_ENTREGA" ? "Na entrega" : metodo,
    total,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">KPIs de Pedidos</h1>
        <p className="text-muted-foreground text-sm mt-1">Últimos 30 dias</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: "Total de Pedidos", value: kpis?.total ?? 0, icon: ShoppingCart, color: "bg-blue-100 text-blue-700" },
          { label: "Entregues", value: kpis?.entregues ?? 0, icon: Package, color: "bg-emerald-100 text-emerald-700" },
          { label: "Cancelados", value: kpis?.cancelados ?? 0, icon: XCircle, color: "bg-red-100 text-red-700" },
          { label: "Receita", value: fmt(kpis?.receita ?? 0), icon: TrendingUp, color: "bg-violet-100 text-violet-700" },
          { label: "Ticket Médio", value: fmt(kpis?.ticketMedio ?? 0), icon: TrendingUp, color: "bg-amber-100 text-amber-700" },
          { label: "Tempo Médio (min)", value: `${kpis?.tempoMedioAtendimento ?? 0} min`, icon: Clock, color: "bg-cyan-100 text-cyan-700" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-3">
              <div className={`inline-flex rounded-lg p-2 mb-2 ${k.color.split(" ")[0]}`}>
                <k.icon className={`h-4 w-4 ${k.color.split(" ")[1]}`} />
              </div>
              <p className="text-xl font-bold leading-tight">{k.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Pedidos por Forma de Pagamento</CardTitle></CardHeader>
        <CardContent>
          {pagamentoData.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {pagamentoData.map((item: any) => (
                <div key={item.metodo} className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">{item.metodo}</p>
                  <p className="mt-1 text-2xl font-bold">{item.total}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">Sem dados de pagamento</div>
          )}
          {Object.keys(kpis?.porPagamentoEntrega ?? {}).length > 0 && (
            <div className="mt-4 rounded-xl border bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Detalhe de pagamento na entrega</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(kpis?.porPagamentoEntrega ?? {}).map(([metodo, total]) => (
                  <div key={metodo} className="rounded-lg bg-background border p-2">
                    <p className="text-xs text-muted-foreground">{metodo === "CARTAO_CREDITO" ? "Cartão" : "Dinheiro"}</p>
                    <p className="text-lg font-bold">{String(total)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Taxa de Cancelamento</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="relative h-24 w-24 flex-shrink-0">
                <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke="hsl(var(--destructive))"
                    strokeWidth="3"
                    strokeDasharray={`${kpis?.taxaCancelamento ?? 0} ${100 - (kpis?.taxaCancelamento ?? 0)}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold">{(kpis?.taxaCancelamento ?? 0).toFixed(1)}%</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-emerald-500" />
                  <span className="text-sm">Entregues: {kpis?.entregues ?? 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-destructive" />
                  <span className="text-sm">Cancelados: {kpis?.cancelados ?? 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-amber-500" />
                  <span className="text-sm">Em andamento: {kpis?.ativos ?? 0}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Pedidos por Origem</CardTitle></CardHeader>
          <CardContent>
            {origemData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={origemData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="origem" tick={{ fontSize: 11 }} width={70} />
                  <Tooltip />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Sem dados</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Volume de Pedidos por Dia</CardTitle></CardHeader>
        <CardContent>
          {kpis?.graficoDiario?.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={kpis.graficoDiario}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="data" tick={{ fontSize: 10 }} tickFormatter={(v) => format(new Date(v + "T12:00:00"), "dd/MM")} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip labelFormatter={(v) => format(new Date(v + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })} />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Sem dados de volume</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
