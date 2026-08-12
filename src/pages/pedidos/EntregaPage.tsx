import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Clock, Truck, CheckCircle, MapPin, Phone, Plus } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const TIPO_LABEL: Record<string, string> = {
  DELIVERY: "Delivery", RETIRADA: "Retirada", LOCAL: "Local",
};

export default function EntregaPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pedidos-entrega"],
    queryFn: () => api.get<{ pedidos: any[] }>("/api/pedidos?limit=200"),
    refetchInterval: 20000,
  });

  const atualizarStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/pedidos/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedidos-entrega"] });
      toast.success("Status atualizado");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const pedidos = data?.pedidos ?? [];
  // Apenas pedidos de delivery em andamento
  const emEntrega = pedidos.filter(p => p.status === "EM_ENTREGA" && p.tipo === "DELIVERY");
  const prontos = pedidos.filter(p => p.status === "PRONTO" && p.tipo === "DELIVERY");
  const retirada = pedidos.filter(p => ["PRONTO", "EM_ENTREGA"].includes(p.status) && p.tipo === "RETIRADA");
  const entreguesHoje = pedidos.filter(p => {
    if (p.status !== "ENTREGUE") return false;
    const hoje = new Date().toISOString().split("T")[0];
    return new Date(p.atualizadoEm).toISOString().split("T")[0] === hoje;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Controle de Entrega</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestão de deliveries e retiradas</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <Button variant="outline" size="icon" className="shrink-0" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          <Button className="w-full sm:w-auto" onClick={() => navigate("/pedidos/novo")}><Plus className="h-4 w-4 mr-2" />Novo Pedido</Button>
        </div>
      </div>

      {/* Contadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Prontos p/ Entrega", value: prontos.length, color: "bg-emerald-100 text-emerald-700" },
          { label: "Em Rota de Entrega", value: emEntrega.length, color: "bg-purple-100 text-purple-700" },
          { label: "Aguardando Retirada", value: retirada.length, color: "bg-amber-100 text-amber-700" },
          { label: "Entregues Hoje", value: entreguesHoje.length, color: "bg-blue-100 text-blue-700" },
        ].map(c => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-3xl font-bold">{c.value}</p>
              <Badge className={`mt-1 text-xs ${c.color}`}>{c.label}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Prontos para sair */}
      {prontos.length > 0 && (
        <div>
          <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            Prontos para Entrega ({prontos.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {prontos.map(p => (
              <Card key={p.id} className="border-emerald-200 bg-emerald-50">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">#{p.numero}</span>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(p.criadoEm), { locale: ptBR, addSuffix: true })}
                    </div>
                  </div>
                  <p className="font-medium text-sm">{p.cliente?.nome ?? p.nomeCliente}</p>
                  {p.enderecoEntrega && (
                    <div className="flex items-start gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>{p.enderecoEntrega}</span>
                    </div>
                  )}
                  {p.telefoneCliente && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      <span>{p.telefoneCliente}</span>
                    </div>
                  )}
                  <p className="font-bold text-sm text-primary">{fmt(p.total)}</p>
                  <Button size="sm" className="w-full h-7 text-xs bg-purple-600 hover:bg-purple-700"
                    onClick={() => atualizarStatus.mutate({ id: p.id, status: "EM_ENTREGA" })}>
                    <Truck className="h-3 w-3 mr-1" />
                    Saiu para Entrega
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Em rota */}
      {emEntrega.length > 0 && (
        <div>
          <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
            <Truck className="h-5 w-5 text-purple-600" />
            Em Rota de Entrega ({emEntrega.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {emEntrega.map(p => (
              <Card key={p.id} className="border-purple-200 bg-purple-50">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">#{p.numero}</span>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(p.criadoEm), { locale: ptBR, addSuffix: true })}
                    </div>
                  </div>
                  <p className="font-medium text-sm">{p.cliente?.nome ?? p.nomeCliente}</p>
                  {p.enderecoEntrega && (
                    <div className="flex items-start gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>{p.enderecoEntrega}</span>
                    </div>
                  )}
                  {p.telefoneCliente && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      <span>{p.telefoneCliente}</span>
                    </div>
                  )}
                  <p className="font-bold text-sm text-primary">{fmt(p.total)}</p>
                  <Button size="sm" className="w-full h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => atualizarStatus.mutate({ id: p.id, status: "ENTREGUE" })}>
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Confirmar Entrega
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Retirada */}
      {retirada.length > 0 && (
        <div>
          <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-amber-600" />
            Aguardando Retirada ({retirada.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {retirada.map(p => (
              <Card key={p.id} className="border-amber-200 bg-amber-50">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">#{p.numero}</span>
                    <Badge className="bg-amber-100 text-amber-700 text-xs">Retirada</Badge>
                  </div>
                  <p className="font-medium text-sm">{p.cliente?.nome ?? p.nomeCliente}</p>
                  {p.telefoneCliente && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      <span>{p.telefoneCliente}</span>
                    </div>
                  )}
                  <p className="font-bold text-sm text-primary">{fmt(p.total)}</p>
                  <Button size="sm" className="w-full h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => atualizarStatus.mutate({ id: p.id, status: "ENTREGUE" })}>
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Cliente Retirou
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {prontos.length === 0 && emEntrega.length === 0 && retirada.length === 0 && !isLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <CheckCircle className="h-10 w-10 mb-2 text-emerald-500" />
            <p className="font-medium">Nenhuma entrega pendente</p>
            <p className="text-sm">Todas as entregas foram concluídas</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
