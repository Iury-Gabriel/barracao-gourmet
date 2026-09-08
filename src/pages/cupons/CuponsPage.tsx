import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Ticket, Copy } from "lucide-react";
import { toast } from "sonner";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TIPOS_PEDIDO = [
  { valor: "DELIVERY", rotulo: "Entrega" },
  { valor: "RETIRADA", rotulo: "Retirada" },
  { valor: "LOCAL", rotulo: "Salão" },
];

type CupomForm = {
  codigo: string;
  tipo: string;
  valor: string;
  ativo: boolean;
  valorMinimoPedido: string;
  descontoMaximo: string;
  limiteUsos: string;
  limitePorCliente: string;
  diasSemana: number[];
  somentePix: boolean;
  tiposPedido: string[];
};

const formVazio = (): CupomForm => ({
  codigo: "",
  tipo: "PERCENTUAL",
  valor: "",
  ativo: true,
  valorMinimoPedido: "",
  descontoMaximo: "",
  limiteUsos: "",
  limitePorCliente: "",
  diasSemana: [],
  somentePix: false,
  tiposPedido: [],
});

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Campo em branco vira null: o backend trata null como "sem limite", e zero
// significaria "limite zero", que travaria o cupom.
const numeroOuNulo = (texto: string) => (texto.trim() ? Number(texto) : null);

export default function CuponsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [form, setForm] = useState<CupomForm>(formVazio());

  const { data: cupons = [], isLoading } = useQuery({
    queryKey: ["cupons"],
    queryFn: () => api.get<any[]>("/api/cupons"),
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["cupons"] });

  const criar = useMutation({
    mutationFn: (dados: any) => api.post("/api/cupons", dados),
    onSuccess: () => {
      invalidar();
      toast.success("Cupom criado");
      fechar();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const atualizar = useMutation({
    mutationFn: ({ id, dados }: any) => api.put(`/api/cupons/${id}`, dados),
    onSuccess: () => {
      invalidar();
      toast.success("Cupom atualizado");
      fechar();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const remover = useMutation({
    mutationFn: (id: string) => api.delete(`/api/cupons/${id}`),
    onSuccess: () => {
      invalidar();
      toast.success("Cupom removido");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const abrirNovo = async () => {
    setEditando(null);
    const base = formVazio();
    // O backend ja tem gerador de codigo; melhor sugerir do que deixar a
    // pessoa inventar um codigo que colide com outro existente.
    try {
      const gerado = await api.get<{ codigo: string }>("/api/cupons/gerar-codigo");
      base.codigo = gerado?.codigo ?? "";
    } catch {
      /* segue com o campo vazio */
    }
    setForm(base);
    setModalOpen(true);
  };

  const abrirEdicao = (cupom: any) => {
    setEditando(cupom);
    setForm({
      codigo: cupom.codigo ?? "",
      tipo: cupom.tipo ?? "PERCENTUAL",
      valor: String(cupom.valor ?? ""),
      ativo: cupom.ativo !== false,
      valorMinimoPedido: cupom.valorMinimoPedido != null ? String(cupom.valorMinimoPedido) : "",
      descontoMaximo: cupom.descontoMaximo != null ? String(cupom.descontoMaximo) : "",
      limiteUsos: cupom.limiteUsos != null ? String(cupom.limiteUsos) : "",
      limitePorCliente: cupom.limitePorCliente != null ? String(cupom.limitePorCliente) : "",
      diasSemana: cupom.diasSemana ?? [],
      somentePix: !!cupom.somentePix,
      tiposPedido: cupom.tiposPedido ?? [],
    });
    setModalOpen(true);
  };

  const fechar = () => {
    setModalOpen(false);
    setEditando(null);
    setForm(formVazio());
  };

  const salvar = () => {
    const dados = {
      codigo: form.codigo.trim().toUpperCase(),
      tipo: form.tipo,
      valor: Number(form.valor),
      ativo: form.ativo,
      valorMinimoPedido: numeroOuNulo(form.valorMinimoPedido),
      descontoMaximo: form.tipo === "PERCENTUAL" ? numeroOuNulo(form.descontoMaximo) : null,
      limiteUsos: numeroOuNulo(form.limiteUsos),
      limitePorCliente: numeroOuNulo(form.limitePorCliente),
      diasSemana: form.diasSemana,
      somentePix: form.somentePix,
      tiposPedido: form.tiposPedido,
    };
    if (editando) atualizar.mutate({ id: editando.id, dados });
    else criar.mutate(dados);
  };

  const alternarDia = (dia: number) =>
    setForm((f) => ({
      ...f,
      diasSemana: f.diasSemana.includes(dia)
        ? f.diasSemana.filter((d) => d !== dia)
        : [...f.diasSemana, dia].sort(),
    }));

  const alternarTipoPedido = (valor: string) =>
    setForm((f) => ({
      ...f,
      tiposPedido: f.tiposPedido.includes(valor)
        ? f.tiposPedido.filter((t) => t !== valor)
        : [...f.tiposPedido, valor],
    }));

  const descontoTexto = (cupom: any) =>
    cupom.tipo === "PERCENTUAL" ? `${cupom.valor}%` : fmt(cupom.valor);

  const restricoesTexto = (cupom: any) => {
    const partes: string[] = [];
    if (cupom.valorMinimoPedido) partes.push(`mínimo ${fmt(cupom.valorMinimoPedido)}`);
    if (cupom.diasSemana?.length) partes.push(cupom.diasSemana.map((d: number) => DIAS[d]).join(", "));
    if (cupom.somentePix) partes.push("só Pix");
    if (cupom.tiposPedido?.length) {
      partes.push(
        cupom.tiposPedido
          .map((t: string) => TIPOS_PEDIDO.find((tp) => tp.valor === t)?.rotulo ?? t)
          .join(", "),
      );
    }
    return partes.length ? partes.join(" · ") : "sem restrição";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cupons de Desconto</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Descontos que o cliente aplica no cardápio digital ou informa para a Linda.
          </p>
        </div>
        <Button onClick={abrirNovo} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Cupom
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ticket className="h-4 w-4" /> Cupons ({cupons.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : cupons.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum cupom criado ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Desconto</TableHead>
                    <TableHead>Usos</TableHead>
                    <TableHead>Regras</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cupons.map((cupom: any) => (
                    <TableRow key={cupom.id}>
                      <TableCell>
                        <button
                          className="flex items-center gap-1.5 font-mono font-semibold hover:text-primary"
                          onClick={() => {
                            navigator.clipboard?.writeText(cupom.codigo);
                            toast.success("Código copiado");
                          }}
                          title="Copiar código"
                        >
                          {cupom.codigo}
                          <Copy className="h-3 w-3 opacity-60" />
                        </button>
                      </TableCell>
                      <TableCell className="font-semibold text-emerald-500">
                        {descontoTexto(cupom)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {cupom.usosCount ?? 0}
                        {cupom.limiteUsos ? ` / ${cupom.limiteUsos}` : ""}
                      </TableCell>
                      <TableCell className="max-w-[260px] text-xs text-muted-foreground">
                        {restricoesTexto(cupom)}
                      </TableCell>
                      <TableCell>
                        {cupom.ativo ? (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Ativo</Badge>
                        ) : (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => abrirEdicao(cupom)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => {
                            if (confirm(`Remover o cupom ${cupom.codigo}?`)) remover.mutate(cupom.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={(aberto) => (aberto ? setModalOpen(true) : fechar())}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar cupom" : "Novo cupom"}</DialogTitle>
            <DialogDescription>
              Campo em branco significa sem limite.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Código *</Label>
                <Input
                  className="font-mono"
                  value={form.codigo}
                  onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value.toUpperCase() }))}
                  placeholder="ALMOCO10"
                />
              </div>
              <div className="space-y-1">
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTUAL">Percentual (%)</SelectItem>
                    <SelectItem value="VALOR_FIXO">Valor fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{form.tipo === "PERCENTUAL" ? "Desconto (%)" : "Desconto (R$)"} *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.valor}
                  onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                />
              </div>
              {form.tipo === "PERCENTUAL" && (
                <div className="space-y-1">
                  <Label>Teto do desconto (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.descontoMaximo}
                    onChange={(e) => setForm((f) => ({ ...f, descontoMaximo: e.target.value }))}
                    placeholder="Sem teto"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Pedido mínimo</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.valorMinimoPedido}
                  onChange={(e) => setForm((f) => ({ ...f, valorMinimoPedido: e.target.value }))}
                  placeholder="R$"
                />
              </div>
              <div className="space-y-1">
                <Label>Total de usos</Label>
                <Input
                  type="number"
                  value={form.limiteUsos}
                  onChange={(e) => setForm((f) => ({ ...f, limiteUsos: e.target.value }))}
                  placeholder="Ilimitado"
                />
              </div>
              <div className="space-y-1">
                <Label>Por cliente</Label>
                <Input
                  type="number"
                  value={form.limitePorCliente}
                  onChange={(e) => setForm((f) => ({ ...f, limitePorCliente: e.target.value }))}
                  placeholder="Ilimitado"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Dias em que vale</Label>
              <div className="flex flex-wrap gap-1.5">
                {DIAS.map((rotulo, dia) => (
                  <Button
                    key={dia}
                    type="button"
                    size="sm"
                    variant={form.diasSemana.includes(dia) ? "default" : "outline"}
                    onClick={() => alternarDia(dia)}
                  >
                    {rotulo}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Nenhum dia marcado: vale todos os dias.
              </p>
            </div>

            <div className="space-y-1">
              <Label>Tipos de pedido</Label>
              <div className="flex flex-wrap gap-1.5">
                {TIPOS_PEDIDO.map((tipo) => (
                  <Button
                    key={tipo.valor}
                    type="button"
                    size="sm"
                    variant={form.tiposPedido.includes(tipo.valor) ? "default" : "outline"}
                    onClick={() => alternarTipoPedido(tipo.valor)}
                  >
                    {tipo.rotulo}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Nenhum marcado: vale para entrega, retirada e salão.
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Switch
                checked={form.somentePix}
                onCheckedChange={(v) => setForm((f) => ({ ...f, somentePix: v }))}
              />
              <div>
                <Label>Só para pagamento no Pix</Label>
                <p className="text-xs text-muted-foreground">
                  Pix cai na hora e não tem taxa de maquininha.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={form.ativo}
                onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))}
              />
              <Label>Cupom ativo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={!form.codigo.trim() || !form.valor || criar.isPending || atualizar.isPending}
            >
              {criar.isPending || atualizar.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
