import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Plus, Search, Eye, UserCheck, UserX, PencilLine, Truck } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ClienteDetailDialog } from "@/components/shared/ClienteDetailDialog";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const emptyForm = { nome: "", telefone: "", email: "", endereco: "", bairro: "", cidade: "São Paulo", observacoes: "", entregaGratis: false };

export default function ClientesPage() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [clienteSelecionado, setClienteSelecionado] = useState<string | null>(null);
  const [clienteModalOpen, setClienteModalOpen] = useState(false);

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => api.get<any[]>("/api/clientes"),
  });

  const criar = useMutation({
    mutationFn: (data: any) => api.post("/api/clientes", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clientes"] }); toast.success("Cliente cadastrado"); fecharModal(); },
    onError: (err: any) => toast.error(err.message),
  });

  const atualizar = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/api/clientes/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clientes"] }); toast.success("Cliente atualizado"); fecharModal(); },
    onError: (err: any) => toast.error(err.message),
  });

  const abrirCriar = () => { setEditando(null); setForm(emptyForm); setModalOpen(true); };
  const abrirEditar = (c: any) => {
    setEditando(c);
    setForm({ nome: c.nome, telefone: c.telefone ?? "", email: c.email ?? "", endereco: c.endereco ?? "", bairro: c.bairro ?? "", cidade: c.cidade ?? "São Paulo", observacoes: c.observacoes ?? "", entregaGratis: Boolean(c.entregaGratis) });
    setModalOpen(true);
  };
  const fecharModal = () => { setModalOpen(false); setEditando(null); setForm(emptyForm); };

  const filtrados = clientes.filter((c: any) => {
    if (!busca) return true;
    return c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (c.telefone ?? "").includes(busca) ||
      (c.email ?? "").toLowerCase().includes(busca.toLowerCase());
  });

  const isInativo = (c: any) => {
    if (!c.ultimoPedido) return c.totalPedidos > 0;
    const dias = (Date.now() - new Date(c.ultimoPedido).getTime()) / (1000 * 60 * 60 * 24);
    return dias > 30;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Base de Clientes</h1>
          <p className="text-muted-foreground text-sm mt-1">{clientes.length} clientes cadastrados</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={abrirCriar}><Plus className="h-4 w-4 mr-2" />Novo Cliente</Button>
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por nome, telefone ou e-mail..." value={busca} onChange={e => setBusca(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40"><p className="text-muted-foreground animate-pulse">Carregando...</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Pedidos</TableHead>
                  <TableHead>Último Pedido</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum cliente encontrado</TableCell></TableRow>
                )}
                {filtrados.map((c: any) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell onClick={() => { setClienteSelecionado(c.id); setClienteModalOpen(true); }}>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium">{c.nome}</p>
                          {c.entregaGratis && (
                            <Badge className="bg-primary/10 text-primary text-xs">
                              <Truck className="h-3 w-3 mr-1" />Entrega grátis
                            </Badge>
                          )}
                        </div>
                        {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{c.telefone ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-bold">{c.totalPedidos}</span>
                        {c.totalPedidos >= 3 && (
                          <Badge className="bg-emerald-100 text-emerald-700 text-xs ml-1">Recorrente</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.ultimoPedido
                        ? formatDistanceToNow(new Date(c.ultimoPedido), { locale: ptBR, addSuffix: true })
                        : "Nunca"}
                    </TableCell>
                    <TableCell>
                      {isInativo(c) ? (
                        <Badge className="bg-red-100 text-red-700 text-xs"><UserX className="h-3 w-3 mr-1" />Inativo</Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-700 text-xs"><UserCheck className="h-3 w-3 mr-1" />Ativo</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setClienteSelecionado(c.id); setClienteModalOpen(true); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEditar(c)}>
                          <PencilLine className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editando ? "Editar Cliente" : "Novo Cliente"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Telefone</Label><Input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(11) 99999-9999" /></div>
              <div className="space-y-1"><Label>E-mail</Label><Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            </div>
            <div className="space-y-1"><Label>Endereço</Label><Input value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} placeholder="Rua, número" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Bairro</Label><Input value={form.bairro} onChange={e => setForm(f => ({ ...f, bairro: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Cidade</Label><Input value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} /></div>
            </div>
            <div className="space-y-1"><Label>Observações</Label><Input value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} /></div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="pr-3">
                <Label htmlFor="entrega-gratis" className="flex items-center gap-1.5">
                  <Truck className="h-4 w-4" />
                  Entrega grátis
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Zera o frete deste cliente em todo pedido de delivery. Não amplia a área de entrega.
                </p>
              </div>
              <Switch
                id="entrega-gratis"
                checked={form.entregaGratis}
                onCheckedChange={(v) => setForm(f => ({ ...f, entregaGratis: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
            <Button onClick={() => editando ? atualizar.mutate({ id: editando.id, data: form }) : criar.mutate(form)} disabled={!form.nome || criar.isPending || atualizar.isPending}>
              {editando ? "Salvar" : "Cadastrar"}
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
