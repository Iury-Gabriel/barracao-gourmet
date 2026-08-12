import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Phone, Mail, MapPin, ShoppingCart, DollarSign, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PedidoDetailDialog } from "@/components/shared/PedidoDetailDialog";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABEL: Record<string, string> = {
  RECEBIDO: "Recebido", EM_PREPARO: "Em preparação", PRONTO: "Pronto",
  EM_ENTREGA: "Para entrega", ENTREGUE: "Entregue", CANCELADO: "Cancelado",
};

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pedidoSelecionado, setPedidoSelecionado] = useState<string | null>(null);
  const [pedidoModalOpen, setPedidoModalOpen] = useState(false);

  const { data: cliente, isLoading } = useQuery({
    queryKey: ["cliente", id],
    queryFn: () => api.get<any>(`/api/clientes/${id}`),
    enabled: !!id,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-muted-foreground animate-pulse">Carregando...</p>
    </div>
  );

  if (!cliente) return (
    <div className="text-center py-12">
      <p className="text-muted-foreground">Cliente não encontrado.</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate("/clientes")}>Voltar</Button>
    </div>
  );

  const pedidosEntregues = cliente.pedidos?.filter((p: any) => p.status === "ENTREGUE") ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/clientes")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{cliente.nome}</h1>
            {cliente.entregaGratis && <Badge className="bg-primary/10 text-primary">Entrega grátis</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            Cliente desde {format(new Date(cliente.criadoEm), "MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-xl p-2 bg-blue-100"><ShoppingCart className="h-4 w-4 text-blue-600" /></div>
            </div>
            <p className="text-2xl font-bold">{cliente.pedidos?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Total de pedidos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-xl p-2 bg-emerald-100"><DollarSign className="h-4 w-4 text-emerald-600" /></div>
            </div>
            <p className="text-2xl font-bold">{fmt(cliente.totalGasto ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">Total gasto</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-xl p-2 bg-violet-100"><TrendingUp className="h-4 w-4 text-violet-600" /></div>
            </div>
            <p className="text-2xl font-bold">{fmt(cliente.ticketMedio ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">Ticket médio</p>
          </CardContent>
        </Card>
      </div>

      {/* Dados */}
      <Card>
        <CardHeader><CardTitle className="text-base">Dados Cadastrais</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {cliente.telefone && (
            <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span>{cliente.telefone}</span></div>
          )}
          {cliente.email && (
            <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><span>{cliente.email}</span></div>
          )}
          {(cliente.endereco || cliente.bairro) && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{[cliente.endereco, cliente.bairro, cliente.cidade].filter(Boolean).join(", ")}</span>
            </div>
          )}
          {cliente.observacoes && (
            <div className="bg-muted rounded-lg p-2 text-muted-foreground italic mt-2">{cliente.observacoes}</div>
          )}
        </CardContent>
      </Card>

      {/* Histórico de pedidos */}
      <Card>
        <CardHeader><CardTitle className="text-base">Histórico de Pedidos</CardTitle></CardHeader>
        <CardContent>
          {cliente.pedidos?.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum pedido registrado.</p>
          ) : (
            <div className="space-y-3">
              {cliente.pedidos?.map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-3 border-b last:border-0 cursor-pointer hover:bg-muted/30 rounded px-2 -mx-2"
                  onClick={() => { setPedidoSelecionado(p.id); setPedidoModalOpen(true); }}
                >
                  <div>
                    <p className="font-medium text-sm">Pedido #{p.numero}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.itens?.map((i: any) => i.produto?.nome).join(", ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(p.criadoEm), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">{fmt(p.total)}</p>
                    <Badge variant="outline" className="text-xs">{STATUS_LABEL[p.status] ?? p.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
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
