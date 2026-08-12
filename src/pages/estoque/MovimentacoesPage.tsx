import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { api } from "@/hooks/useApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, ArrowUp, BadgeDollarSign, Calculator, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type TipoMovimentoFiltro = "TODOS" | "ENTRADA" | "SAIDA" | "AJUSTE";
type CustoModo = "UNITARIO" | "TOTAL";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function MovimentacoesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<TipoMovimentoFiltro>("TODOS");
  const [modoCusto, setModoCusto] = useState<CustoModo>("UNITARIO");
  const [form, setForm] = useState({
    produtoId: "",
    variacaoNome: "",
    tipo: "ENTRADA",
    quantidade: "",
    custoUnitario: "",
    custoTotal: "",
    motivo: "",
  });

  const { data: produtos = [] } = useQuery({
    queryKey: ["estoque"],
    queryFn: () => api.get<any[]>("/api/estoque"),
  });

  const { data: movimentacoes = [], isLoading } = useQuery({
    queryKey: ["movimentacoes", filtroTipo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filtroTipo !== "TODOS") params.set("tipo", filtroTipo);
      return api.get<any[]>(`/api/estoque/movimentacoes${params.toString() ? `?${params.toString()}` : ""}`);
    },
  });

  const produtoSelecionado = useMemo(
    () => produtos.find((produto: any) => produto.id === form.produtoId),
    [produtos, form.produtoId],
  );

  const exigeVariacao = Boolean(produtoSelecionado?.controlaEstoquePorVariacao);
  const variacoesDisponiveis = Array.isArray(produtoSelecionado?.variacoes) ? produtoSelecionado.variacoes : [];
  const quantidade = Number(form.quantidade || 0);
  const custoUnitarioCalculado = Number(form.custoUnitario || 0);
  const custoTotalCalculado = form.tipo === "ENTRADA"
    ? (modoCusto === "TOTAL" ? Number(form.custoTotal || 0) : quantidade * custoUnitarioCalculado)
    : 0;

  const registrar = useMutation({
    mutationFn: (data: any) => api.post("/api/estoque/movimentacao", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movimentacoes"] });
      queryClient.invalidateQueries({ queryKey: ["estoque"] });
      toast.success("Movimentacao registrada");
      setModalOpen(false);
      setForm({
        produtoId: "",
        variacaoNome: "",
        tipo: "ENTRADA",
        quantidade: "",
        custoUnitario: "",
        custoTotal: "",
        motivo: "",
      });
      setModoCusto("UNITARIO");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Movimentacoes de Estoque</h1>
          <p className="mt-1 text-sm text-muted-foreground">Entradas, saidas, ajustes e custo real de reposicao</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filtroTipo} onValueChange={(value) => setFiltroTipo(value as TipoMovimentoFiltro)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Filtrar tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todas</SelectItem>
              <SelectItem value="ENTRADA">Entradas</SelectItem>
              <SelectItem value="SAIDA">Saidas</SelectItem>
              <SelectItem value="AJUSTE">Ajustes</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Movimentacao
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <p className="animate-pulse text-muted-foreground">Carregando...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Sabor</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Custo Unit.</TableHead>
                  <TableHead>Custo Total</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimentacoes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      Nenhuma movimentacao encontrada
                    </TableCell>
                  </TableRow>
                )}
                {movimentacoes.map((movimentacao: any) => (
                  <TableRow key={movimentacao.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {movimentacao.tipo === "ENTRADA" && <ArrowUp className="h-4 w-4 text-emerald-600" />}
                        {movimentacao.tipo === "SAIDA" && <ArrowDown className="h-4 w-4 text-red-500" />}
                        {movimentacao.tipo === "AJUSTE" && <RefreshCw className="h-4 w-4 text-blue-500" />}
                        <Badge variant={movimentacao.tipo === "ENTRADA" ? "default" : movimentacao.tipo === "SAIDA" ? "destructive" : "secondary"} className="text-xs">
                          {movimentacao.tipo}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{movimentacao.produto?.nome}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{movimentacao.variacaoNome ?? "-"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{movimentacao.produto?.categoria}</Badge></TableCell>
                    <TableCell className="font-bold">{movimentacao.quantidade}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{movimentacao.custoUnitario ? fmt(Number(movimentacao.custoUnitario)) : "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{movimentacao.custoTotal ? fmt(Number(movimentacao.custoTotal)) : "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{movimentacao.motivo ?? "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(movimentacao.criadoEm), "dd/MM/yy HH:mm", { locale: ptBR })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova Movimentacao</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Produto *</Label>
                <Select
                  value={form.produtoId}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, produtoId: value, variacaoNome: "" }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar produto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {produtos.map((produto: any) => (
                      <SelectItem key={produto.id} value={produto.id}>
                        {produto.nome} (estoque: {produto.estoque})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {exigeVariacao && (
                <div className="space-y-1">
                  <Label>Sabor *</Label>
                  <Select
                    value={form.variacaoNome}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, variacaoNome: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar sabor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {variacoesDisponiveis.map((variacao: any) => (
                        <SelectItem key={`${variacao.nome}-${variacao.ordem ?? 0}`} value={variacao.nome}>
                          {variacao.nome} (estoque: {variacao.estoque ?? 0})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(value) => setForm((prev) => ({ ...prev, tipo: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ENTRADA">Entrada</SelectItem>
                    <SelectItem value="SAIDA">Saida</SelectItem>
                    <SelectItem value="AJUSTE">Ajuste</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Quantidade *</Label>
                <Input type="number" min="1" value={form.quantidade} onChange={(e) => setForm((prev) => ({ ...prev, quantidade: e.target.value }))} />
              </div>

              {form.tipo === "ENTRADA" && (
                <>
                  <div className="space-y-2">
                    <Label>Modo de custo</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant={modoCusto === "UNITARIO" ? "default" : "outline"} onClick={() => setModoCusto("UNITARIO")}>
                        <BadgeDollarSign className="mr-2 h-4 w-4" />
                        Custo unitario
                      </Button>
                      <Button type="button" variant={modoCusto === "TOTAL" ? "default" : "outline"} onClick={() => setModoCusto("TOTAL")}>
                        <Calculator className="mr-2 h-4 w-4" />
                        Custo total
                      </Button>
                    </div>
                  </div>

                  {modoCusto === "UNITARIO" ? (
                    <div className="space-y-1">
                      <Label>Custo unitario (R$) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.custoUnitario}
                        onChange={(e) => setForm((prev) => ({ ...prev, custoUnitario: e.target.value }))}
                        placeholder="Quanto custou cada unidade"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label>Custo total (R$) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.custoTotal}
                        onChange={(e) => setForm((prev) => ({ ...prev, custoTotal: e.target.value }))}
                        placeholder="Custo total da reposicao"
                      />
                    </div>
                  )}
                </>
              )}

              <div className="space-y-1">
                <Label>Motivo</Label>
                <Input value={form.motivo} onChange={(e) => setForm((prev) => ({ ...prev, motivo: e.target.value }))} placeholder="Ex: Compra fornecedor, quebra, inventario..." />
              </div>
            </div>

            <Card className="bg-muted/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Resumo da movimentacao</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Produto</span>
                  <span className="text-right font-medium">{produtoSelecionado?.nome ?? "-"}</span>
                </div>
                {exigeVariacao && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Sabor</span>
                    <span className="font-medium">{form.variacaoNome || "-"}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Quantidade</span>
                  <span className="font-medium">{quantidade || "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tipo</span>
                  <span className="font-medium">{form.tipo}</span>
                </div>
                {form.tipo === "ENTRADA" && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Custo unitario</span>
                      <span className="font-medium">{modoCusto === "UNITARIO" ? fmt(custoUnitarioCalculado || 0) : "Calculado automaticamente"}</span>
                    </div>
                    <div className="flex items-center justify-between border-t pt-3">
                      <span className="font-medium">Custo total</span>
                      <span className="text-base font-bold text-primary">{fmt(custoTotalCalculado || 0)}</span>
                    </div>
                  </>
                )}
                <p className="pt-2 text-xs text-muted-foreground">
                  Quando o produto controla estoque por sabor, a movimentacao vai direto no sabor escolhido.
                </p>
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button
              onClick={() =>
                registrar.mutate({
                  ...form,
                  quantidade: Number(form.quantidade),
                  variacaoNome: exigeVariacao ? form.variacaoNome : undefined,
                  custoUnitario: form.tipo === "ENTRADA" && modoCusto === "UNITARIO" ? Number(form.custoUnitario) : undefined,
                  custoTotal: form.tipo === "ENTRADA" && modoCusto === "TOTAL" ? Number(form.custoTotal) : undefined,
                })
              }
              disabled={
                !form.produtoId ||
                (exigeVariacao && !form.variacaoNome) ||
                !form.quantidade ||
                (form.tipo === "ENTRADA" && (modoCusto === "UNITARIO" ? !form.custoUnitario : !form.custoTotal)) ||
                registrar.isPending
              }
            >
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
