import { useQuery } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Mail, MapPin, ShoppingCart, DollarSign, TrendingUp, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABEL: Record<string, string> = {
  RECEBIDO: "Recebido",
  EM_PREPARO: "Em preparação",
  PRONTO: "Pronto",
  EM_ENTREGA: "Para entrega",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

const TIPO_INTERACAO: Record<string, { label: string; color: string }> = {
  PEDIDO: { label: "Pedido", color: "bg-blue-100 text-blue-700" },
  CONTATO: { label: "Contato", color: "bg-violet-100 text-violet-700" },
  OBSERVACAO: { label: "Observação", color: "bg-gray-100 text-gray-700" },
  REATIVACAO: { label: "Reativação", color: "bg-emerald-100 text-emerald-700" },
};

type ClienteDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string | null;
};

export function ClienteDetailDialog({ open, onOpenChange, clienteId }: ClienteDetailDialogProps) {
  const { data: cliente, isLoading } = useQuery({
    queryKey: ["cliente", clienteId],
    queryFn: () => api.get<any>(`/api/clientes/${clienteId}`),
    enabled: open && !!clienteId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Cliente</DialogTitle>
        </DialogHeader>

        {!clienteId ? (
          <p className="text-sm text-muted-foreground">Selecione um cliente para ver os detalhes.</p>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-muted-foreground animate-pulse">Carregando...</p>
          </div>
        ) : !cliente ? (
          <div className="text-center py-6">
            <p className="text-muted-foreground">Cliente não encontrado.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">{cliente.nome}</h2>
                <p className="text-sm text-muted-foreground">
                  Cliente desde {format(new Date(cliente.criadoEm), "MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {cliente.entregaGratis && <Badge className="bg-primary/10 text-primary">Entrega grátis</Badge>}
                {cliente.recorrente && <Badge className="bg-emerald-100 text-emerald-700">Recorrente</Badge>}
                {cliente.inativo && <Badge className="bg-red-100 text-red-700">Inativo</Badge>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="rounded-xl p-2 bg-blue-100 inline-flex mb-2">
                    <ShoppingCart className="h-4 w-4 text-blue-600" />
                  </div>
                  <p className="text-2xl font-bold">{cliente.pedidos?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total de pedidos</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="rounded-xl p-2 bg-emerald-100 inline-flex mb-2">
                    <DollarSign className="h-4 w-4 text-emerald-600" />
                  </div>
                  <p className="text-2xl font-bold">{fmt(cliente.totalGasto ?? 0)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total gasto</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="rounded-xl p-2 bg-violet-100 inline-flex mb-2">
                    <TrendingUp className="h-4 w-4 text-violet-600" />
                  </div>
                  <p className="text-2xl font-bold">{fmt(cliente.ticketMedio ?? 0)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Ticket médio</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Dados Cadastrais</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {cliente.telefone && (
                  <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span>{cliente.telefone}</span></div>
                )}
                {cliente.email && (
                  <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><span>{cliente.email}</span></div>
                )}
                {(cliente.endereco || cliente.bairro || cliente.cidade) && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{[cliente.endereco, cliente.bairro, cliente.cidade].filter(Boolean).join(", ")}</span>
                  </div>
                )}
                {cliente.observacoes && (
                  <div className="bg-muted rounded-lg p-3 text-muted-foreground italic mt-2">{cliente.observacoes}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Conversas e Interações
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cliente.interacoes?.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhuma interação registrada.</p>
                ) : (
                  <div className="space-y-3">
                    {cliente.interacoes?.map((i: any) => {
                      const cfg = TIPO_INTERACAO[i.tipo] ?? { label: i.tipo, color: "bg-gray-100 text-gray-700" };
                      return (
                        <div key={i.id} className="rounded-xl border p-3">
                          <div className="flex items-center justify-between gap-3">
                            <Badge className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(i.criadoEm), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                          <p className="mt-2 text-sm">{i.descricao}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Histórico de Pedidos</CardTitle></CardHeader>
              <CardContent>
                {cliente.pedidos?.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhum pedido registrado.</p>
                ) : (
                  <div className="space-y-3">
                    {cliente.pedidos?.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between py-3 border-b last:border-0 rounded px-2 -mx-2">
                        <div>
                          <p className="font-medium text-sm">Pedido #{p.numero}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.itens?.map((i: any) => i.produto?.nome).join(", ")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(p.criadoEm), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                        <div className="text-right space-y-1">
                          <p className="font-bold text-sm">{fmt(p.total)}</p>
                          <Badge variant="outline" className="text-xs">{STATUS_LABEL[p.status] ?? p.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
