import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Clock, ShoppingCart, ChefHat, CheckCircle, Truck, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { PedidoDetailDialog } from "@/components/shared/PedidoDetailDialog";
import { getNextPedidoStatus, getNextPedidoStatusLabel } from "@/lib/pedidoStatus";

const STATUS_CONFIG = {
  RECEBIDO: { label: "Recebido", color: "bg-blue-50 border-blue-200", badge: "bg-blue-100 text-blue-800", icon: ShoppingCart },
  EM_PREPARO: { label: "Em preparação", color: "bg-amber-50 border-amber-200", badge: "bg-amber-100 text-amber-800", icon: ChefHat },
  PRONTO: { label: "Pronto", color: "bg-emerald-50 border-emerald-200", badge: "bg-emerald-100 text-emerald-800", icon: CheckCircle },
  EM_ENTREGA: { label: "Para entrega", color: "bg-purple-50 border-purple-200", badge: "bg-purple-100 text-purple-800", icon: Truck },
};

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function OperacionalPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pedidoSelecionado, setPedidoSelecionado] = useState<string | null>(null);
  const [pedidoModalOpen, setPedidoModalOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pedidos-operacional"],
    queryFn: () => api.get<{ pedidos: any[] }>("/api/pedidos?limit=200"),
    refetchInterval: 30000,
  });

  const atualizarStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/pedidos/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedidos-operacional"] });
      toast.success("Status atualizado");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const pedidos = data?.pedidos ?? [];
  const ativos = pedidos.filter((p) => !["ENTREGUE", "CANCELADO"].includes(p.status));

  const totalAtivos = ativos.length;
  const porStatus = Object.keys(STATUS_CONFIG).reduce((acc, s) => {
    acc[s] = ativos.filter((p) => p.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Painel Operacional</h1>
          <p className="text-muted-foreground text-sm mt-1">Visão em tempo real - atualiza a cada 30s</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <Button variant="outline" size="icon" className="shrink-0" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          <Button className="w-full sm:w-auto" onClick={() => navigate("/pedidos/novo")}><Plus className="h-4 w-4 mr-2" />Novo Pedido</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
          const Icon = cfg.icon;
          return (
            <Card key={status} className={`border-2 ${cfg.color}`}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{cfg.label}</span>
                </div>
                <p className="text-3xl font-bold">{porStatus[status] ?? 0}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-muted-foreground animate-pulse">Carregando...</p>
        </div>
      ) : totalAtivos === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <CheckCircle className="h-10 w-10 mb-2 text-emerald-500" />
            <p className="font-medium">Nenhum pedido em andamento</p>
            <p className="text-sm">Todos os pedidos foram finalizados</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
            const colPedidos = ativos.filter((p) => p.status === status);
            if (colPedidos.length === 0) return null;
            const Icon = cfg.icon;

            return (
              <div key={status}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="h-5 w-5" />
                  <h2 className="font-semibold">{cfg.label}</h2>
                  <Badge className={cfg.badge}>{colPedidos.length}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {colPedidos.map((pedido) => (
                    <Card
                      key={pedido.id}
                      className={`border ${cfg.color} cursor-pointer hover:shadow-md transition-shadow`}
                      onClick={() => {
                        setPedidoSelecionado(pedido.id);
                        setPedidoModalOpen(true);
                      }}
                    >
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold">#{pedido.numero}</span>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(pedido.criadoEm), { locale: ptBR, addSuffix: true })}
                          </div>
                        </div>
                        <p className="text-sm font-medium truncate">
                          {pedido.cliente?.nome ?? pedido.nomeCliente ?? "Cliente não identificado"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {pedido.itens?.length ?? 0} iten{pedido.itens?.length !== 1 ? "s" : ""} · {fmt(pedido.total)}
                        </p>
                        {getNextPedidoStatus(pedido) && (
                          <Button
                            size="sm"
                            className="w-full h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              atualizarStatus.mutate({ id: pedido.id, status: getNextPedidoStatus(pedido) });
                            }}
                          >
                            {getNextPedidoStatusLabel(pedido, STATUS_CONFIG)}
                          </Button>
                        )}
                        {status === "EM_ENTREGA" && (
                          <Button
                            size="sm"
                            className="w-full h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              atualizarStatus.mutate({ id: pedido.id, status: "ENTREGUE" });
                            }}
                          >
                            ✓ Marcar como Entregue
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PedidoDetailDialog
        open={pedidoModalOpen}
        onOpenChange={setPedidoModalOpen}
        pedidoId={pedidoSelecionado}
      />
    </div>
  );
}
