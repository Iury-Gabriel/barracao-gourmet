import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, Users, Plus, Check, X, Bot } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Reserva = {
  id: string;
  nomeCliente: string;
  telefone: string;
  pessoas: number;
  dataHora: string;
  observacoes?: string | null;
  status: string;
  origem: string;
};

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Aguardando confirmação",
  CONFIRMADA: "Confirmada",
  CANCELADA: "Cancelada",
  CONCLUIDA: "Compareceu",
};

const STATUS_CLASSE: Record<string, string> = {
  PENDENTE: "bg-amber-100 text-amber-700",
  CONFIRMADA: "bg-emerald-100 text-emerald-700",
  CANCELADA: "bg-rose-100 text-rose-700",
  CONCLUIDA: "bg-blue-100 text-blue-700",
};

const FORM_VAZIO = { nomeCliente: "", telefone: "", pessoas: "2", dataHora: "", observacoes: "" };

export default function ReservasPage() {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState("TODAS");
  const [dialogAberto, setDialogAberto] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);

  const { data: reservas = [], isLoading } = useQuery({
    queryKey: ["reservas", filtro],
    queryFn: () => api.get<Reserva[]>(`/api/reservas${filtro === "TODAS" ? "" : `?status=${filtro}`}`),
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["reservas"] });

  const criar = useMutation({
    mutationFn: (dados: any) => api.post("/api/reservas", dados),
    onSuccess: () => {
      invalidar();
      toast.success("Reserva registrada");
      setDialogAberto(false);
      setForm(FORM_VAZIO);
    },
    // O backend recusa com o motivo em texto (48h, domingo, fora do horário).
    onError: (err: any) => toast.error(err.message),
  });

  const mudarStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/reservas/${id}/status`, { status }),
    onSuccess: () => { invalidar(); toast.success("Reserva atualizada"); },
    onError: (err: any) => toast.error(err.message),
  });

  const pendentes = reservas.filter((r) => r.status === "PENDENTE").length;
  const proximas = reservas.filter(
    (r) => r.status === "CONFIRMADA" && new Date(r.dataHora).getTime() >= Date.now(),
  ).length;

  return (
    <div className="space-y-6">
      <div className="page-header items-end">
        <div>
          <h1 className="text-2xl font-bold">Reservas de Mesa</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Reservas do salão. As que a Linda registra pelo WhatsApp chegam aqui aguardando confirmação.
          </p>
        </div>
        <Button onClick={() => setDialogAberto(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova reserva
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-xl p-2 bg-amber-100"><CalendarDays className="h-4 w-4 text-amber-600" /></div>
            </div>
            <p className="text-2xl font-bold">{pendentes}</p>
            <p className="text-sm text-muted-foreground">Aguardando confirmação</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-xl p-2 bg-emerald-100"><Check className="h-4 w-4 text-emerald-600" /></div>
            </div>
            <p className="text-2xl font-bold">{proximas}</p>
            <p className="text-sm text-muted-foreground">Confirmadas a chegar</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-xl p-2 bg-blue-100"><Users className="h-4 w-4 text-blue-600" /></div>
            </div>
            <p className="text-2xl font-bold">{reservas.length}</p>
            <p className="text-sm text-muted-foreground">Total no filtro</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={filtro} onValueChange={setFiltro}>
        <TabsList>
          <TabsTrigger value="TODAS">Todas</TabsTrigger>
          <TabsTrigger value="PENDENTE">Aguardando</TabsTrigger>
          <TabsTrigger value="CONFIRMADA">Confirmadas</TabsTrigger>
          <TabsTrigger value="CANCELADA">Canceladas</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Reservas</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Carregando...</div>
          ) : reservas.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Nenhuma reserva neste filtro
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Pessoas</TableHead>
                    <TableHead>Observações</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reservas.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(r.dataHora), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="font-medium">{r.nomeCliente}</p>
                            <p className="text-xs text-muted-foreground">{r.telefone}</p>
                          </div>
                          {r.origem === "WHATSAPP_IA" && (
                            <Bot className="h-3.5 w-3.5 text-muted-foreground" aria-label="Registrada pela Linda" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{r.pessoas}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
                        {r.observacoes || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_CLASSE[r.status] || ""}>{STATUS_LABEL[r.status] || r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {r.status === "PENDENTE" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => mudarStatus.mutate({ id: r.id, status: "CONFIRMADA" })}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Confirmar
                          </Button>
                        )}
                        {r.status === "CONFIRMADA" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => mudarStatus.mutate({ id: r.id, status: "CONCLUIDA" })}
                          >
                            Compareceu
                          </Button>
                        )}
                        {r.status !== "CANCELADA" && r.status !== "CONCLUIDA" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => mudarStatus.mutate({ id: r.id, status: "CANCELADA" })}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova reserva</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome do cliente</Label>
              <Input value={form.nomeCliente} onChange={(e) => setForm({ ...form, nomeCliente: e.target.value })} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Pessoas</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.pessoas}
                  onChange={(e) => setForm({ ...form, pessoas: e.target.value })}
                />
              </div>
              <div>
                <Label>Data e hora</Label>
                <Input
                  type="datetime-local"
                  value={form.dataHora}
                  onChange={(e) => setForm({ ...form, dataHora: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                placeholder="Aniversário, cadeirão, pet..."
              />
            </div>
            <p className="text-xs text-muted-foreground">
              O salão atende de segunda a sábado, das 10h às 15h, e a reserva precisa de 48h de antecedência.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>Cancelar</Button>
            <Button
              onClick={() =>
                criar.mutate({
                  nomeCliente: form.nomeCliente,
                  telefone: form.telefone,
                  pessoas: Number(form.pessoas),
                  dataHora: form.dataHora,
                  observacoes: form.observacoes,
                  origem: "MANUAL",
                })
              }
              disabled={criar.isPending || !form.nomeCliente || !form.telefone || !form.dataHora}
            >
              {criar.isPending ? "Salvando..." : "Salvar reserva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
