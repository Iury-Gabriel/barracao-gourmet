import { useQuery } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, TrendingUp, UserCheck, UserX, Calendar, ShoppingCart } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { ClienteDetailDialog } from "@/components/shared/ClienteDetailDialog";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function RecorrenciaClientesPage() {
  const [clienteSelecionado, setClienteSelecionado] = useState<string | null>(null);
  const [clienteModalOpen, setClienteModalOpen] = useState(false);

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => api.get<any[]>("/api/clientes"),
  });

  const { data: kpis } = useQuery({
    queryKey: ["clientes-kpis"],
    queryFn: () => api.get<any>("/api/clientes/kpis"),
  });

  const recorrentes = clientes.filter((c: any) => c.recorrente);
  const inativos = clientes.filter((c: any) => c.inativo);
  const novos = clientes.filter((c: any) => {
    return (Date.now() - new Date(c.criadoEm).getTime()) / (1000 * 60 * 60 * 24) <= 30;
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-muted-foreground animate-pulse">Carregando...</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recorrência de Clientes</h1>
        <p className="text-muted-foreground text-sm mt-1">Análise de fidelidade e retenção</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total de Clientes",  value: kpis?.total ?? 0,       icon: Users,      color: "bg-blue-100 text-blue-700" },
          { label: "Recorrentes (3+)",   value: kpis?.recorrentes ?? 0, icon: UserCheck,  color: "bg-emerald-100 text-emerald-700" },
          { label: "Inativos (+30d)",    value: kpis?.inativos ?? 0,    icon: UserX,      color: "bg-red-100 text-red-700" },
          { label: "Novos (30d)",        value: kpis?.novos30dias ?? 0, icon: Calendar,   color: "bg-violet-100 text-violet-700" },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-3">
              <div className={`inline-flex rounded-lg p-2 mb-2 ${k.color.split(" ")[0]}`}>
                <k.icon className={`h-4 w-4 ${k.color.split(" ")[1]}`} />
              </div>
              <p className="text-2xl font-bold">{k.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Clientes recorrentes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-emerald-600" />
              Clientes Recorrentes ({recorrentes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recorrentes.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">Nenhum cliente recorrente ainda</p>
            ) : (
              <div className="space-y-2">
                {recorrentes.slice(0, 10).map((c: any) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between py-2 border-b last:border-0 cursor-pointer hover:bg-muted/30 rounded px-1"
                    onClick={() => { setClienteSelecionado(c.id); setClienteModalOpen(true); }}
                  >
                    <div>
                      <p className="text-sm font-medium">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">{c.telefone}</p>
                    </div>
                    <div className="text-right">
                      <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                        <ShoppingCart className="h-3 w-3 mr-1" />
                        {c.totalPedidos} pedidos
                      </Badge>
                      {c.ultimoPedido && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(c.ultimoPedido), { locale: ptBR, addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Clientes inativos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserX className="h-4 w-4 text-red-600" />
              Clientes Inativos ({inativos.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {inativos.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">Nenhum cliente inativo</p>
            ) : (
              <div className="space-y-2">
                {inativos.slice(0, 10).map((c: any) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between py-2 border-b last:border-0 cursor-pointer hover:bg-muted/30 rounded px-1"
                    onClick={() => { setClienteSelecionado(c.id); setClienteModalOpen(true); }}
                  >
                    <div>
                      <p className="text-sm font-medium">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">{c.telefone}</p>
                    </div>
                    <div className="text-right">
                      <Badge className="bg-red-100 text-red-700 text-xs">
                        {c.diasSemPedido}d sem pedido
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.totalPedidos} pedidos total</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <ClienteDetailDialog
        open={clienteModalOpen}
        onOpenChange={setClienteModalOpen}
        clienteId={clienteSelecionado}
      />
    </div>
  );
}
