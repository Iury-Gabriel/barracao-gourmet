import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Clock, MapPin, Phone, User, CreditCard, Ticket, Barcode } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getAvailablePedidoStatus } from "@/lib/pedidoStatus";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  RECEBIDO: { label: "Recebido", color: "bg-blue-100 text-blue-800" },
  EM_PREPARO: { label: "Em preparação", color: "bg-amber-100 text-amber-800" },
  PRONTO: { label: "Pronto", color: "bg-emerald-100 text-emerald-800" },
  EM_ENTREGA: { label: "Para entrega", color: "bg-purple-100 text-purple-800" },
  ENTREGUE: { label: "Entregue", color: "bg-gray-100 text-gray-600" },
  CANCELADO: { label: "Cancelado", color: "bg-red-100 text-red-700" },
};

const PAGAMENTO_LABEL: Record<string, string> = {
  PIX: "PIX",
  CARTAO_CREDITO: "Cartão crédito",
  CARTAO_DEBITO: "Cartão débito",
  DINHEIRO: "Dinheiro",
  PAGAR_NA_ENTREGA: "Na entrega",
  PENDENTE: "Pendente",
};

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PedidoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [novoStatus, setNovoStatus] = useState("");

  const { data: pedido, isLoading } = useQuery({
    queryKey: ["pedido", id],
    queryFn: () => api.get<any>(`/api/pedidos/${id}`),
    enabled: !!id,
    refetchInterval: 10000,
  });

  const atualizarStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/api/pedidos/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedido", id] });
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      toast.success("Status atualizado");
      setNovoStatus("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const cancelar = useMutation({
    mutationFn: () => api.delete(`/api/pedidos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      toast.success("Pedido cancelado");
      navigate("/pedidos");
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground animate-pulse">Carregando...</p>
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Pedido não encontrado.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/pedidos")}>Voltar</Button>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[pedido.status] ?? { label: pedido.status, color: "bg-gray-100 text-gray-600" };
  const statusOptions = getAvailablePedidoStatus(pedido, Object.keys(STATUS_CONFIG));

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pedidos")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Pedido #{pedido.numero}</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(pedido.criadoEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
        <Badge className={`ml-auto ${cfg.color}`}>{cfg.label}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>{pedido.cliente?.nome ?? pedido.nomeCliente ?? "Não identificado"}</span>
            </div>
            {(pedido.telefoneCliente || pedido.cliente?.telefone) && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{pedido.telefoneCliente ?? pedido.cliente?.telefone}</span>
              </div>
            )}
            {(pedido.cepEntrega || pedido.cliente?.cep) && (
              <div className="flex items-center gap-2">
                <Barcode className="h-4 w-4 text-muted-foreground" />
                <span>{pedido.cepEntrega ?? pedido.cliente?.cep}</span>
              </div>
            )}
            {pedido.enderecoEntrega && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{pedido.enderecoEntrega}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Tipo:</span>
              <span className="font-medium">{pedido.tipo}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Pagamento</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span>{PAGAMENTO_LABEL[pedido.pagamento] ?? pedido.pagamento}</span>
            </div>
            <div className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-muted-foreground" />
              <span>Status do pagamento: {pedido.statusPagamento}</span>
            </div>
            {pedido.pagamentoEntregaMetodo && (
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span>Na entrega via {PAGAMENTO_LABEL[pedido.pagamentoEntregaMetodo] ?? pedido.pagamentoEntregaMetodo}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Itens do Pedido</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {pedido.itens?.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-medium text-sm">{item.produto?.nome}</p>
                  {item.variacaoNome && <p className="text-xs text-muted-foreground">Sabor: {item.variacaoNome}</p>}
                  <p className="text-xs text-muted-foreground">{item.quantidade}x {fmt(item.precoUnit)}</p>
                </div>
                <span className="font-bold text-sm">{fmt(item.subtotal)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 font-bold">
              <span>Total</span>
              <span className="text-primary text-lg">{fmt(pedido.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {pedido.historico?.map((h: any) => {
              const hcfg = STATUS_CONFIG[h.status] ?? { label: h.status, color: "bg-gray-100 text-gray-600" };
              return (
                <div key={h.id} className="flex items-start gap-3">
                  <div className="flex items-center gap-2 mt-0.5">
                    <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </div>
                  <div>
                    <Badge className={`text-xs ${hcfg.color}`}>{hcfg.label}</Badge>
                    {h.obs && <p className="text-xs text-muted-foreground mt-0.5">{h.obs}</p>}
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(h.criadoEm), "dd/MM HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {!["ENTREGUE", "CANCELADO"].includes(pedido.status) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Atualizar Status</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-3">
              <Select value={novoStatus} onValueChange={setNovoStatus}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecionar novo status..." />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>{STATUS_CONFIG[status]?.label ?? status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!novoStatus || atualizarStatus.isPending}
                onClick={() => atualizarStatus.mutate(novoStatus)}
              >
                Confirmar
              </Button>
            </div>
            <Button
              variant="destructive"
              disabled={cancelar.isPending}
              onClick={() => cancelar.mutate()}
            >
              Cancelar Pedido
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
