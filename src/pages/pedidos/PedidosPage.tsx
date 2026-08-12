import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { Plus, RefreshCw, Clock, ShoppingCart, ChefHat, CheckCircle, Truck, PackageCheck, XCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PedidoDetailDialog } from "@/components/shared/PedidoDetailDialog";
import { getNextPedidoStatus, getNextPedidoStatusLabel } from "@/lib/pedidoStatus";
import { useAutoPrintEnabled } from "@/hooks/useAutoPrintPedidos";
import { imprimirPedido } from "@/lib/printPedido";

const STATUS_CONFIG = {
  RECEBIDO: { label: "Recebido", color: "bg-blue-100 text-blue-800", icon: ShoppingCart, border: "border-blue-200" },
  EM_PREPARO: { label: "Em preparação", color: "bg-amber-100 text-amber-800", icon: ChefHat, border: "border-amber-200" },
  PRONTO: { label: "Pronto", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle, border: "border-emerald-200" },
  EM_ENTREGA: { label: "Para entrega", color: "bg-purple-100 text-purple-800", icon: Truck, border: "border-purple-200" },
  ENTREGUE: { label: "Entregue", color: "bg-gray-100 text-gray-600", icon: PackageCheck, border: "border-gray-200" },
  CANCELADO: { label: "Cancelado", color: "bg-red-100 text-red-700", icon: XCircle, border: "border-red-200" },
};

const PIPELINE_COLUMNS = ["RECEBIDO", "EM_PREPARO", "PRONTO", "EM_ENTREGA"];

const ORIGEM_LABEL: Record<string, string> = {
  CARDAPIO_DIGITAL: "Cardápio",
  MANUAL: "Manual",
  WHATSAPP: "WhatsApp",
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

export default function PedidosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [origemFiltro, setOrigemFiltro] = useState("todos");
  const [pedidoSelecionado, setPedidoSelecionado] = useState<string | null>(null);
  const [pedidoModalOpen, setPedidoModalOpen] = useState(false);
  const [autoPrint, setAutoPrint] = useAutoPrintEnabled();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pedidos", "ativos"],
    queryFn: () => api.get<{ pedidos: any[] }>("/api/pedidos?limit=200"),
    refetchInterval: 10000,
  });

  const atualizarStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/pedidos/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      toast.success("Status atualizado");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const pedidos = data?.pedidos ?? [];
  const ativos = pedidos.filter((p) => !["ENTREGUE", "CANCELADO"].includes(p.status));
  const filtrados = origemFiltro === "todos" ? ativos : ativos.filter((p) => p.origem === origemFiltro);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pipeline de Pedidos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {ativos.length} pedido{ativos.length !== 1 ? "s" : ""} em andamento
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <Select value={origemFiltro} onValueChange={setOrigemFiltro}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas origens</SelectItem>
              <SelectItem value="CARDAPIO_DIGITAL">Cardápio</SelectItem>
              <SelectItem value="MANUAL">Manual</SelectItem>
              <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={autoPrint ? "default" : "outline"}
            className="shrink-0"
            onClick={() => {
              const novo = !autoPrint;
              setAutoPrint(novo);
              toast.success(novo ? "Impressão automática ligada (este computador)." : "Impressão automática desligada.");
            }}
            title="Imprime automaticamente os pedidos novos nesta máquina"
          >
            <Printer className="h-4 w-4 mr-2" />
            {autoPrint ? "Impressão: ON" : "Impressão: OFF"}
          </Button>
          {autoPrint && (
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              title="Imprimir cupom de teste"
              onClick={() =>
                imprimirPedido({
                  numero: 0,
                  tipo: "RETIRADA",
                  origem: "TESTE",
                  nomeCliente: "Cupom de teste",
                  telefoneCliente: "",
                  total: 0,
                  itens: [{ produto: { nome: "Teste de impressao" }, quantidade: 1, subtotal: 0 }],
                  criadoEm: new Date().toISOString(),
                })
              }
            >
              <Printer className="h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" size="icon" className="shrink-0" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => navigate("/pedidos/novo")}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Pedido
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground animate-pulse">Carregando pedidos...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {PIPELINE_COLUMNS.map((status) => {
            const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
            const colPedidos = filtrados.filter((p) => p.status === status);
            const Icon = cfg.icon;

            return (
              <div key={status} className="flex flex-col gap-3">
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${cfg.border} bg-card`}>
                  <Icon className="h-4 w-4" />
                  <span className="font-semibold text-sm">{cfg.label}</span>
                  <Badge variant="secondary" className="ml-auto text-xs">{colPedidos.length}</Badge>
                </div>

                <div className="flex flex-col gap-2 min-h-[120px]">
                  {colPedidos.length === 0 && (
                    <div className="flex items-center justify-center h-20 rounded-lg border border-dashed text-muted-foreground text-sm">
                      Nenhum pedido
                    </div>
                  )}
                  {colPedidos.map((pedido) => (
                    <Card
                      key={pedido.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => {
                        setPedidoSelecionado(pedido.id);
                        setPedidoModalOpen(true);
                      }}
                    >
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm">#{pedido.numero}</span>
                          <Badge variant="outline" className="text-xs">
                            {ORIGEM_LABEL[pedido.origem] ?? pedido.origem}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium truncate">
                          {pedido.cliente?.nome ?? pedido.nomeCliente ?? "Cliente não identificado"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {pedido.itens?.length ?? 0} ite{pedido.itens?.length !== 1 ? "ns" : "m"}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-primary">{fmt(pedido.total)}</span>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(pedido.criadoEm), { locale: ptBR, addSuffix: true })}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge variant="outline" className="max-w-full text-[10px]">
                            {PAGAMENTO_LABEL[pedido.pagamento] ?? pedido.pagamento}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground break-words">
                            {pedido.statusPagamento === "PAGO" ? "Pago" : "Aguardando pagamento"}
                          </span>
                        </div>
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
