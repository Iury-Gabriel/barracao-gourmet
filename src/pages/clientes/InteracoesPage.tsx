import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MessageSquare, Plus, Search, ShoppingCart, Phone, Eye } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { ClienteDetailDialog } from "@/components/shared/ClienteDetailDialog";

const TIPO_LABEL: Record<string, { label: string; color: string }> = {
  PEDIDO:      { label: "Pedido",      color: "bg-blue-100 text-blue-700" },
  CONTATO:     { label: "Contato",     color: "bg-violet-100 text-violet-700" },
  OBSERVACAO:  { label: "Observação",  color: "bg-gray-100 text-gray-700" },
  REATIVACAO:  { label: "Reativação",  color: "bg-emerald-100 text-emerald-700" },
};

export default function InteracoesClientesPage() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ clienteId: "", tipo: "CONTATO", descricao: "" });
  const [clienteSelecionado, setClienteSelecionado] = useState<string | null>(null);
  const [clienteModalOpen, setClienteModalOpen] = useState(false);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => api.get<any[]>("/api/clientes"),
  });

  // Buscar interações de todos os clientes via detalhe — simplificado: mostrar últimas interações
  // Para uma visão global, vamos mostrar as interações dos clientes filtrados
  const clientesFiltrados = clientes.filter((c: any) =>
    !busca || c.nome.toLowerCase().includes(busca.toLowerCase()) || (c.telefone ?? "").includes(busca)
  );

  const adicionarInteracao = useMutation({
    mutationFn: () => api.post(`/api/clientes/${form.clienteId}/interacoes`, {
      tipo: form.tipo,
      descricao: form.descricao,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cliente"] });
      toast.success("Interação registrada");
      setModalOpen(false);
      setForm({ clienteId: "", tipo: "CONTATO", descricao: "" });
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Interações com Clientes</h1>
          <p className="text-muted-foreground text-sm mt-1">Registro centralizado de contatos e histórico</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Interação
        </Button>
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar cliente..." value={busca} onChange={e => setBusca(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {clientesFiltrados.slice(0, 30).map((c: any) => (
          <Card key={c.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{c.nome}</p>
                  {c.telefone && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Phone className="h-3 w-3" />
                      {c.telefone}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {c.recorrente && <Badge className="bg-emerald-100 text-emerald-700 text-xs">Recorrente</Badge>}
                  {c.inativo && <Badge className="bg-red-100 text-red-700 text-xs">Inativo</Badge>}
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1">
                  <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{c.totalPedidos}</span>
                  <span className="text-muted-foreground">pedidos</span>
                </div>
                {c.ultimoPedido && (
                  <span className="text-xs text-muted-foreground">
                    Último: {format(new Date(c.ultimoPedido), "dd/MM/yy", { locale: ptBR })}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={() => { setClienteSelecionado(c.id); setClienteModalOpen(true); }}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Ver histórico
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={() => { setForm(f => ({ ...f, clienteId: c.id })); setModalOpen(true); }}
                >
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Registrar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nova Interação</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Cliente *</Label>
              <Select value={form.clienteId} onValueChange={v => setForm(f => ({ ...f, clienteId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar cliente..." /></SelectTrigger>
                <SelectContent>
                  {clientes.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONTATO">Contato</SelectItem>
                  <SelectItem value="OBSERVACAO">Observação</SelectItem>
                  <SelectItem value="REATIVACAO">Reativação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Descrição *</Label>
              <Input
                value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Descreva a interação..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => adicionarInteracao.mutate()}
              disabled={!form.clienteId || !form.descricao || adicionarInteracao.isPending}
            >
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ClienteDetailDialog
        open={clienteModalOpen}
        onOpenChange={setClienteModalOpen}
        clienteId={clienteSelecionado}
      />
    </div>
  );
}

