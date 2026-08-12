import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, Eye, Trash2 } from "lucide-react";
import { PedidoDetailDialog } from "@/components/shared/PedidoDetailDialog";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  RECEBIDO:   { label: "Recebido",   color: "bg-blue-100 text-blue-800" },
  EM_PREPARO: { label: "Em preparação", color: "bg-amber-100 text-amber-800" },
  PRONTO:     { label: "Pronto",     color: "bg-emerald-100 text-emerald-800" },
  EM_ENTREGA: { label: "Para entrega", color: "bg-purple-100 text-purple-800" },
  ENTREGUE:   { label: "Entregue",   color: "bg-gray-100 text-gray-600" },
  CANCELADO:  { label: "Cancelado",  color: "bg-red-100 text-red-700" },
};

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function HistoricoPedidosPage() {
  const queryClient = useQueryClient();
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [busca, setBusca] = useState("");
  const [pedidoSelecionado, setPedidoSelecionado] = useState<string | null>(null);
  const [pedidoModalOpen, setPedidoModalOpen] = useState(false);

  const params = new URLSearchParams();
  if (statusFiltro !== "todos") params.set("status", statusFiltro);
  if (dataInicio) params.set("dataInicio", dataInicio);
  if (dataFim) params.set("dataFim", dataFim);
  params.set("limit", "100");

  const { data, isLoading } = useQuery({
    queryKey: ["pedidos", "historico", statusFiltro, dataInicio, dataFim],
    queryFn: () => api.get<{ pedidos: any[]; total: number }>(`/api/pedidos?${params.toString()}`),
  });

  const apagarPedido = useMutation({
    mutationFn: (pedidoId: string) => api.delete(`/api/pedidos/${pedidoId}/remover`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      queryClient.invalidateQueries({ queryKey: ["pedido"] });
      queryClient.invalidateQueries({ queryKey: ["estoque"] });
      queryClient.invalidateQueries({ queryKey: ["financeiro-resumo"] });
      queryClient.invalidateQueries({ queryKey: ["financeiro-lancamentos"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-pedidos"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-resumo"] });
      toast.success("Pedido apagado com sucesso");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const pedidos = (data?.pedidos ?? []).filter(p => {
    if (!busca) return true;
    const nome = (p.cliente?.nome ?? p.nomeCliente ?? "").toLowerCase();
    return nome.includes(busca.toLowerCase()) || String(p.numero).includes(busca);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Histórico de Pedidos</h1>
        <p className="text-muted-foreground text-sm mt-1">{data?.total ?? 0} pedidos encontrados</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-0 w-full flex-1 sm:min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por cliente ou número..." value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos status</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([s, c]) => (
                  <SelectItem key={s} value={s}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" className="w-full sm:w-40" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            <Input type="date" className="w-full sm:w-40" value={dataFim} onChange={e => setDataFim(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-muted-foreground animate-pulse">Carregando...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pedidos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum pedido encontrado
                    </TableCell>
                  </TableRow>
                )}
                {pedidos.map(p => {
                  const cfg = STATUS_CONFIG[p.status] ?? { label: p.status, color: "bg-gray-100 text-gray-600" };
                  return (
                    <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setPedidoSelecionado(p.id); setPedidoModalOpen(true); }}>
                      <TableCell className="font-bold">#{p.numero}</TableCell>
                      <TableCell>{p.cliente?.nome ?? p.nomeCliente ?? "—"}</TableCell>
                      <TableCell>{p.tipo}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.origem}</TableCell>
                      <TableCell><Badge className={`text-xs ${cfg.color}`}>{cfg.label}</Badge></TableCell>
                      <TableCell className="font-bold">{fmt(p.total)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(p.criadoEm), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setPedidoSelecionado(p.id); setPedidoModalOpen(true); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            disabled={apagarPedido.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              const ok = window.confirm(`Apagar permanentemente o pedido #${p.numero}?`);
                              if (!ok) return;
                              apagarPedido.mutate(p.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <PedidoDetailDialog
        open={pedidoModalOpen}
        onOpenChange={setPedidoModalOpen}
        pedidoId={pedidoSelecionado}
      />
    </div>
  );
}
