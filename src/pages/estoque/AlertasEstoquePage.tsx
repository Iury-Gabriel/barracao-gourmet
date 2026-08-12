import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function AlertasEstoquePage() {
  const queryClient = useQueryClient();
  const [reposicaoModal, setReposicaoModal] = useState<any>(null);
  const [qtdReposicao, setQtdReposicao] = useState("");

  const { data: produtos = [], isLoading } = useQuery({
    queryKey: ["estoque-alertas"],
    queryFn: () => api.get<any[]>("/api/estoque?alertas=true"),
  });

  const repor = useMutation({
    mutationFn: ({ produtoId, quantidade }: { produtoId: string; quantidade: number }) =>
      api.post("/api/estoque/movimentacao", { produtoId, tipo: "ENTRADA", quantidade, motivo: "Reposição de estoque" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estoque-alertas"] });
      queryClient.invalidateQueries({ queryKey: ["estoque"] });
      toast.success("Estoque reposto com sucesso");
      setReposicaoModal(null);
      setQtdReposicao("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Alertas de Estoque</h1>
        <p className="text-muted-foreground text-sm mt-1">Produtos com estoque abaixo do mínimo</p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-xl p-2 bg-red-100">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
            </div>
            <p className="text-2xl font-bold">{produtos.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Produtos em alerta</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-xl p-2 bg-amber-100">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
            </div>
            <p className="text-2xl font-bold">{produtos.filter((p: any) => p.estoque === 0).length}</p>
            <p className="text-xs text-muted-foreground mt-1">Produtos zerados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-xl p-2 bg-orange-100">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
              </div>
            </div>
            <p className="text-2xl font-bold">{produtos.filter((p: any) => p.estoque > 0 && p.estoque <= p.estoqueMinimo).length}</p>
            <p className="text-xs text-muted-foreground mt-1">Estoque crítico</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Produtos que precisam de reposição
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40"><p className="text-muted-foreground animate-pulse">Carregando...</p></div>
          ) : produtos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <p className="font-medium">Nenhum alerta no momento</p>
              <p className="text-sm">Todos os produtos estão com estoque adequado</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Estoque Atual</TableHead>
                  <TableHead>Estoque Mínimo</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {produtos.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell><Badge variant="outline">{p.categoria}</Badge></TableCell>
                    <TableCell>{fmt(p.preco)}</TableCell>
                    <TableCell>
                      <span className={p.estoque === 0 ? "text-red-600 font-bold" : "text-amber-600 font-bold"}>
                        {p.estoque}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.estoqueMinimo}</TableCell>
                    <TableCell>
                      <Badge className={p.estoque === 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}>
                        {p.estoque === 0 ? "Zerado" : "Crítico"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => { setReposicaoModal(p); setQtdReposicao(""); }}>
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Repor
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reposicaoModal} onOpenChange={() => setReposicaoModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Repor Estoque — {reposicaoModal?.nome}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Estoque atual: <strong>{reposicaoModal?.estoque}</strong> | Mínimo: <strong>{reposicaoModal?.estoqueMinimo}</strong></p>
            <div className="space-y-1">
              <Label>Quantidade a adicionar *</Label>
              <Input type="number" min="1" value={qtdReposicao} onChange={e => setQtdReposicao(e.target.value)} autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReposicaoModal(null)}>Cancelar</Button>
            <Button
              onClick={() => repor.mutate({ produtoId: reposicaoModal.id, quantidade: Number(qtdReposicao) })}
              disabled={!qtdReposicao || repor.isPending}
            >
              Confirmar Reposição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
