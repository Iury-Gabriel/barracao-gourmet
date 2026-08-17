import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "@/hooks/useApi";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { resolveImageUrl } from "@/lib/media";
import { API_URL } from "@/lib/apiBaseUrl";
import { AlertTriangle, Edit, ImagePlus, Plus, Search, Trash2, Wine } from "lucide-react";
import { toast } from "sonner";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type VariacaoForm = {
  nome: string;
  descricao: string;
  estoque: string;
  estoqueMinimo: string;
};

type ProdutoForm = {
  nome: string;
  descricao: string;
  categoria: string;
  tipoVariacao: string;
  controlaEstoquePorVariacao: boolean;
  preco: string;
  estoque: string;
  custoMedio: string;
  estoqueMinimo: string;
  disponivel: boolean;
  imagemUrl: string;
  variacoes: VariacaoForm[];
};

function toReadableError(value: unknown): string {
  if (value instanceof Error) {
    const lines = [`Tipo: ${value.name}`, `Mensagem: ${value.message}`];
    if (value.cause) lines.push(`Cause: ${String(value.cause)}`);
    if (value.stack) lines.push(`Stack: ${value.stack}`);
    return lines.join("\n");
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const createEmptyVariacao = (): VariacaoForm => ({
  nome: "",
  descricao: "",
  estoque: "0",
  estoqueMinimo: "0",
});

const createEmptyForm = (): ProdutoForm => ({
  nome: "",
  descricao: "",
  categoria: "",
  tipoVariacao: "",
  controlaEstoquePorVariacao: false,
  preco: "",
  estoque: "",
  custoMedio: "",
  estoqueMinimo: "5",
  disponivel: true,
  imagemUrl: "",
  variacoes: [],
});

function formatarResumoVariacoes(produto: any) {
  if (!Array.isArray(produto.variacoes) || produto.variacoes.length === 0) return "";
  return produto.variacoes
    .map((variacao: any) =>
      produto.controlaEstoquePorVariacao ? `${variacao.nome} (${variacao.estoque ?? 0})` : variacao.nome,
    )
    .join(", ");
}

export default function ProdutosPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const categoriaParam = searchParams.get("categoria") || "todas";

  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState(categoriaParam);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [form, setForm] = useState<ProdutoForm>(createEmptyForm());
  const [uploadingImg, setUploadingImg] = useState(false);
  const [uploadErrorDetail, setUploadErrorDetail] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: produtos = [], isLoading } = useQuery({
    queryKey: ["estoque"],
    queryFn: () => api.get<any[]>("/api/estoque"),
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ["estoque-categorias"],
    queryFn: () => api.get<string[]>("/api/estoque/categorias"),
  });

  const valorTotalEstoque = produtos.reduce((total: number, produto: any) => total + ((produto.custoMedio ?? 0) * (produto.estoque ?? 0)), 0);
  const categoriasSelect = Array.from(new Set([...categorias, ...(form.categoria ? [form.categoria] : [])])).sort((a, b) => a.localeCompare(b));
  const estoqueTotalVariacoes = form.variacoes.reduce((total, variacao) => total + Number(variacao.estoque || 0), 0);
  const saboresComEstoqueBaixo = form.variacoes.filter((variacao) => Number(variacao.estoque || 0) <= Number(variacao.estoqueMinimo || 0)).length;

  const criar = useMutation({
    mutationFn: (data: any) => api.post("/api/estoque", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estoque"] });
      toast.success("Produto criado");
      fecharModal();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const atualizar = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/api/estoque/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estoque"] });
      toast.success("Produto atualizado");
      fecharModal();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => api.delete(`/api/estoque/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estoque"] });
      queryClient.invalidateQueries({ queryKey: ["cardapio-publico"] });
      toast.success("Produto excluido");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const fecharModal = () => {
    setModalOpen(false);
    setEditando(null);
    setForm(createEmptyForm());
    setUploadErrorDetail(null);
    setPreviewUrl(null);
  };

  const abrirCriar = () => {
    setEditando(null);
    setForm(createEmptyForm());
    setUploadErrorDetail(null);
    setPreviewUrl(null);
    setModalOpen(true);
  };

  const abrirEditar = (produto: any) => {
    setEditando(produto);
    setForm({
      nome: produto.nome,
      descricao: produto.descricao ?? "",
      categoria: produto.categoria,
      tipoVariacao: produto.tipoVariacao ?? "",
      controlaEstoquePorVariacao: Boolean(produto.controlaEstoquePorVariacao),
      preco: String(produto.preco),
      estoque: String(produto.estoque),
      custoMedio: String(produto.custoMedio ?? 0),
      estoqueMinimo: String(produto.estoqueMinimo ?? 0),
      disponivel: Boolean(produto.disponivel),
      imagemUrl: produto.imagemUrl ?? "",
      variacoes: (produto.variacoes ?? []).map((variacao: any) => ({
        nome: variacao.nome ?? "",
        descricao: variacao.descricao ?? "",
        estoque: String(variacao.estoque ?? 0),
        estoqueMinimo: String(variacao.estoqueMinimo ?? 0),
      })),
    });
    setUploadErrorDetail(null);
    setPreviewUrl(resolveImageUrl(produto.imagemUrl));
    setModalOpen(true);
  };

  const adicionarVariacao = () => {
    setForm((prev) => ({
      ...prev,
      variacoes: [...prev.variacoes, createEmptyVariacao()],
    }));
  };

  const removerVariacao = (index: number) => {
    setForm((prev) => ({
      ...prev,
      variacoes: prev.variacoes.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const atualizarVariacao = (index: number, campo: keyof VariacaoForm, valor: string) => {
    setForm((prev) => ({
      ...prev,
      variacoes: prev.variacoes.map((variacao, currentIndex) =>
        currentIndex === index ? { ...variacao, [campo]: valor } : variacao,
      ),
    }));
  };

  const handleImageUpload = async (file: File) => {
    setUploadingImg(true);
    setUploadErrorDetail(null);
    try {
      const formData = new FormData();
      formData.append("imagem", file);
      const token = localStorage.getItem("barracao_token");
      const res = await fetch(`${API_URL}/api/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const responseText = await res.text();
        let errorMessage = `HTTP ${res.status}`;
        if (responseText) {
          try {
            const parsed = JSON.parse(responseText);
            if (parsed?.details) {
              errorMessage = `${parsed?.error || errorMessage}\nDetalhes:\n${JSON.stringify(parsed.details, null, 2)}`;
            } else {
              errorMessage = parsed?.error || responseText;
            }
          } catch {
            errorMessage = responseText;
          }
        }
        throw new Error(errorMessage);
      }
      const data = await res.json();
      setForm((prev) => ({ ...prev, imagemUrl: data.url }));
      setPreviewUrl(resolveImageUrl(data.url));
      toast.success("Imagem enviada");
    } catch (err: any) {
      const fullError = toReadableError(err);
      console.error("[ProdutosPage] Erro completo no upload de imagem:", err);
      setUploadErrorDetail(fullError);
      toast.error("Falha no upload da imagem. Erro exibido na tela.");
    } finally {
      setUploadingImg(false);
    }
  };

  const salvar = () => {
    const data = {
      ...form,
      tipoVariacao: form.tipoVariacao.trim() || undefined,
      controlaEstoquePorVariacao: form.controlaEstoquePorVariacao,
      preco: Number(form.preco),
      custoMedio: Number(form.custoMedio || 0),
      estoque: Number(form.controlaEstoquePorVariacao ? estoqueTotalVariacoes : form.estoque),
      estoqueMinimo: Number(form.estoqueMinimo || 0),
      variacoes: form.variacoes
        .map((variacao) => ({
          nome: variacao.nome.trim(),
          descricao: variacao.descricao.trim() || undefined,
          estoque: Number(variacao.estoque || 0),
          estoqueMinimo: Number(variacao.estoqueMinimo || 0),
        }))
        .filter((variacao) => variacao.nome),
    };

    if (editando) atualizar.mutate({ id: editando.id, data });
    else criar.mutate(data);
  };

  const confirmarExclusaoProduto = (produto: any) => {
    const ok = window.confirm(`Excluir o produto "${produto.nome}"? Essa acao nao pode ser desfeita.`);
    if (!ok) return;
    excluir.mutate(produto.id);
  };

  const filtrados = produtos.filter((produto: any) => {
    const matchBusca = produto.nome.toLowerCase().includes(busca.toLowerCase());
    const matchCategoria = categoriaFiltro === "todas" || produto.categoria === categoriaFiltro;
    return matchBusca && matchCategoria;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {produtos.length} produtos cadastrados - estoque estimado em {fmt(valorTotalEstoque)}
          </p>
        </div>
        <Button className="w-full sm:w-auto" onClick={abrirCriar}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Produto
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-0 w-full flex-1 sm:min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar produto..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas categorias</SelectItem>
            {categorias.map((categoria) => (
              <SelectItem key={categoria} value={categoria}>
                {categoria}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                  <TableHead>Foto</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Preco</TableHead>
                  <TableHead>Custo</TableHead>
                  <TableHead>Estoque</TableHead>
                  <TableHead>Minimo</TableHead>
                  <TableHead>Valor Estoque</TableHead>
                  <TableHead>Disponivel</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                      Nenhum produto encontrado
                    </TableCell>
                  </TableRow>
                )}
                {filtrados.map((produto: any) => (
                  <TableRow key={produto.id}>
                    <TableCell>
                      {produto.imagemUrl ? (
                        <img src={resolveImageUrl(produto.imagemUrl) ?? undefined} alt={produto.nome} className="h-10 w-10 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                          <Wine className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{produto.nome}</p>
                        {produto.descricao && <p className="max-w-48 truncate text-xs text-muted-foreground">{produto.descricao}</p>}
                        {Array.isArray(produto.variacoes) && produto.variacoes.length > 0 && (
                          <p className="max-w-56 truncate text-xs text-muted-foreground">
                            {produto.tipoVariacao || "Variacoes"}: {formatarResumoVariacoes(produto)}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{produto.categoria}</Badge></TableCell>
                    <TableCell className="font-bold">{fmt(produto.preco)}</TableCell>
                    <TableCell className="font-medium">{fmt(produto.custoMedio ?? 0)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {produto.estoque <= produto.estoqueMinimo && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                        <span className={produto.estoque <= produto.estoqueMinimo ? "font-bold text-amber-600" : ""}>
                          {produto.estoque}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{produto.estoqueMinimo}</TableCell>
                    <TableCell className="font-medium">{fmt((produto.custoMedio ?? 0) * produto.estoque)}</TableCell>
                    <TableCell>
                      <Badge variant={produto.disponivel ? "default" : "secondary"}>{produto.disponivel ? "Sim" : "Nao"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEditar(produto)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => confirmarExclusaoProduto(produto)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
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
        <DialogContent className="max-h-[90vh] w-[min(96vw,1100px)] max-w-5xl overflow-y-auto p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{editando ? "Editar Produto" : "Novo Produto"}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {form.controlaEstoquePorVariacao
                ? "Acompanhe o estoque total do produto e os saldos de cada sabor no mesmo lugar."
                : "Edite os dados principais do produto e acompanhe o estoque geral com mais clareza."}
            </p>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            <div className="space-y-1">
              <Label>Foto do Produto</Label>
              <div
                className="relative flex h-36 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-muted-foreground/30 transition-colors hover:border-primary/50"
                onClick={() => fileInputRef.current?.click()}
              >
                {previewUrl ? (
                  <>
                    <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
                      <p className="text-sm font-medium text-white">Trocar foto</p>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    {uploadingImg ? (
                      <p className="text-sm animate-pulse">Enviando...</p>
                    ) : (
                      <>
                        <ImagePlus className="h-8 w-8" />
                        <p className="text-sm">Clique para adicionar foto</p>
                        <p className="text-xs">JPG, PNG, WebP ate 500MB</p>
                      </>
                    )}
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                }}
              />
              {uploadErrorDetail && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2">
                  <p className="text-xs font-semibold text-destructive">Erro completo do upload:</p>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] text-destructive">{uploadErrorDetail}</pre>
                </div>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Categoria *</Label>
                <Select value={form.categoria} onValueChange={(value) => setForm((prev) => ({ ...prev, categoria: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={categorias.length > 0 ? "Selecionar categoria..." : "Cadastre uma categoria primeiro"} />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriasSelect.map((categoria) => (
                      <SelectItem key={categoria} value={categoria}>
                        {categoria}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Descricao</Label>
              <Input value={form.descricao} onChange={(e) => setForm((prev) => ({ ...prev, descricao: e.target.value }))} />
            </div>

            <div className={`grid gap-3 ${form.controlaEstoquePorVariacao ? "lg:grid-cols-3" : "md:grid-cols-2"}`}>
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estoque do produto</p>
                <p className="mt-2 text-3xl font-semibold">{form.controlaEstoquePorVariacao ? estoqueTotalVariacoes : Number(form.estoque || 0)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {form.controlaEstoquePorVariacao ? "Total somado automaticamente pelos sabores." : "Quantidade geral disponivel para venda."}
                </p>
              </div>

              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {form.controlaEstoquePorVariacao ? "Sabores cadastrados" : "Estoque minimo"}
                </p>
                <p className="mt-2 text-3xl font-semibold">{form.controlaEstoquePorVariacao ? form.variacoes.length : Number(form.estoqueMinimo || 0)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {form.controlaEstoquePorVariacao ? "Quantidade de variacoes controladas individualmente." : "Ponto de alerta para reposicao do produto."}
                </p>
              </div>

              {form.controlaEstoquePorVariacao && (
                <div className="rounded-xl border bg-muted/30 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sabores em alerta</p>
                  <p className="mt-2 text-3xl font-semibold">{saboresComEstoqueBaixo}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Sabores com estoque igual ou abaixo do minimo configurado.</p>
                </div>
              )}
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.controlaEstoquePorVariacao}
                  onCheckedChange={(value) => setForm((prev) => ({ ...prev, controlaEstoquePorVariacao: value }))}
                />
                <div>
                  <Label>Controlar estoque pelas variacoes</Label>
                  <p className="text-xs text-muted-foreground">Use para produtos em que cada sabor tenha estoque proprio.</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Variacoes do produto</Label>
                  <p className="text-xs text-muted-foreground">
                    {form.controlaEstoquePorVariacao
                      ? "Cada sabor tem o proprio estoque, e o total do produto e calculado automaticamente."
                      : "Cadastre variacoes como sabor, tamanho ou opcao visual do produto."}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={adicionarVariacao}>
                  <Plus className="mr-1 h-3 w-3" />
                  Adicionar variacao
                </Button>
              </div>

              <div className="space-y-1">
                <Label>Tipo da variacao</Label>
                <Input
                  placeholder="Ex: Sabor"
                  value={form.tipoVariacao}
                  onChange={(e) => setForm((prev) => ({ ...prev, tipoVariacao: e.target.value }))}
                />
              </div>

              {form.variacoes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem variacoes cadastradas para este produto.</p>
              ) : (
                <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
                  {form.controlaEstoquePorVariacao && (
                    <div className="hidden grid-cols-[1.15fr_1.45fr_0.8fr_0.8fr_auto] gap-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
                      <span>Nome</span>
                      <span>Descricao</span>
                      <span>Estoque</span>
                      <span>Minimo</span>
                      <span className="text-right">Acao</span>
                    </div>
                  )}
                  {form.variacoes.map((variacao, index) => (
                    <div
                      key={index}
                      className={`items-start rounded-lg border bg-background p-3 ${
                        form.controlaEstoquePorVariacao
                          ? "grid gap-3 lg:grid-cols-[1.15fr_1.45fr_0.8fr_0.8fr_auto]"
                          : "grid gap-3 md:grid-cols-[1fr_1fr_auto]"
                      }`}
                    >
                      <div className="space-y-1">
                        <Label className="text-xs lg:sr-only">Nome da variacao</Label>
                        <Input
                          placeholder="Nome da variacao"
                          value={variacao.nome}
                          onChange={(e) => atualizarVariacao(index, "nome", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs lg:sr-only">Descricao da variacao</Label>
                        <Input
                          placeholder="Descricao da variacao"
                          value={variacao.descricao}
                          onChange={(e) => atualizarVariacao(index, "descricao", e.target.value)}
                        />
                      </div>
                      {form.controlaEstoquePorVariacao && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-xs lg:sr-only">Estoque</Label>
                            <Input
                              type="number"
                              min="0"
                              placeholder="Estoque"
                              value={variacao.estoque}
                              onChange={(e) => atualizarVariacao(index, "estoque", e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs lg:sr-only">Minimo</Label>
                            <Input
                              type="number"
                              min="0"
                              placeholder="Minimo"
                              value={variacao.estoqueMinimo}
                              onChange={(e) => atualizarVariacao(index, "estoqueMinimo", e.target.value)}
                            />
                          </div>
                        </>
                      )}
                      <div className="flex items-end justify-end">
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => removerVariacao(index)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Preco (R$) *</Label>
                <Input type="number" step="0.01" value={form.preco} onChange={(e) => setForm((prev) => ({ ...prev, preco: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Custo medio (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.custoMedio}
                  onChange={(e) => setForm((prev) => ({ ...prev, custoMedio: e.target.value }))}
                  placeholder="Quanto custou"
                />
              </div>
              <div className="space-y-1">
                <Label>{form.controlaEstoquePorVariacao ? "Estoque total" : "Estoque"}</Label>
                <Input
                  type="number"
                  value={form.controlaEstoquePorVariacao ? String(estoqueTotalVariacoes) : form.estoque}
                  onChange={(e) => setForm((prev) => ({ ...prev, estoque: e.target.value }))}
                  readOnly={form.controlaEstoquePorVariacao}
                  className={form.controlaEstoquePorVariacao ? "bg-muted/50 font-semibold" : undefined}
                />
              </div>
              <div className="space-y-1">
                <Label>Minimo</Label>
                <Input type="number" value={form.estoqueMinimo} onChange={(e) => setForm((prev) => ({ ...prev, estoqueMinimo: e.target.value }))} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.disponivel} onCheckedChange={(value) => setForm((prev) => ({ ...prev, disponivel: value }))} />
              <Label>Disponivel no cardapio</Label>
            </div>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
            <Button onClick={salvar} disabled={!form.nome || !form.categoria || !form.preco || uploadingImg || criar.isPending || atualizar.isPending}>
              {editando ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
