import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Plus, Tags, Pencil, Trash2, Image as ImageIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { API_URL } from "@/lib/apiBaseUrl";
import { resolveImageUrl } from "@/lib/media";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Campo de upload da capa da categoria (mostrada como imagem principal no cardapio).
function ImagemCategoriaField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = resolveImageUrl(value);

  const handleFile = async (file: File) => {
    setUploading(true);
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
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onChange(data.url);
      toast.success("Imagem enviada");
    } catch (err: any) {
      toast.error(err?.message || "Falha no upload da imagem.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1">
      <Label>Capa da categoria (aparece no cardápio)</Label>
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border bg-muted flex items-center justify-center">
          {preview ? (
            <img src={preview} alt="Capa da categoria" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col items-start gap-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Enviando...</>
            ) : (
              preview ? "Trocar imagem" : "Enviar imagem"
            )}
          </Button>
          {preview && (
            <Button type="button" variant="ghost" size="sm" className="text-destructive h-7" onClick={() => onChange("")}>
              <X className="h-3 w-3 mr-1" />Remover
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CategoriasEstoquePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [nomeCategoria, setNomeCategoria] = useState("");
  const [acrescimoCategoria, setAcrescimoCategoria] = useState("0");
  const [imagemCategoria, setImagemCategoria] = useState("");
  const [modalEditarOpen, setModalEditarOpen] = useState(false);
  const [categoriaEditando, setCategoriaEditando] = useState<any | null>(null);
  const [nomeCategoriaEdit, setNomeCategoriaEdit] = useState("");
  const [acrescimoCategoriaEdit, setAcrescimoCategoriaEdit] = useState("0");
  const [imagemCategoriaEdit, setImagemCategoriaEdit] = useState("");

  const { data: produtos = [], isLoading: isLoadingProdutos } = useQuery({
    queryKey: ["estoque"],
    queryFn: () => api.get<any[]>("/api/estoque"),
  });

  const { data: categorias = [], isLoading: isLoadingCategorias } = useQuery({
    queryKey: ["estoque-categorias-detalhes"],
    queryFn: () => api.get<any[]>("/api/estoque/categorias/detalhes"),
  });

  const criarCategoria = useMutation({
    mutationFn: (data: { nome: string; acrescimoCartao: number; imagemUrl?: string }) =>
      api.post("/api/estoque/categorias", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estoque-categorias"] });
      queryClient.invalidateQueries({ queryKey: ["estoque-categorias-detalhes"] });
      queryClient.invalidateQueries({ queryKey: ["cardapio-categorias"] });
      toast.success("Categoria cadastrada");
      setNomeCategoria("");
      setAcrescimoCategoria("0");
      setImagemCategoria("");
      setModalOpen(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Salva a edicao: atualiza se a categoria ja e formal (tem id) ou cria a linha
  // formal quando a categoria so existia atraves dos produtos (id nulo).
  const atualizarCategoria = useMutation({
    mutationFn: (data: { id?: string | null; nome: string; acrescimoCartao: number; imagemUrl: string }) => {
      const payload = { nome: data.nome, acrescimoCartao: data.acrescimoCartao, imagemUrl: data.imagemUrl };
      return data.id
        ? api.put(`/api/estoque/categorias/${data.id}`, payload)
        : api.post("/api/estoque/categorias", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estoque"] });
      queryClient.invalidateQueries({ queryKey: ["estoque-categorias"] });
      queryClient.invalidateQueries({ queryKey: ["estoque-categorias-detalhes"] });
      queryClient.invalidateQueries({ queryKey: ["cardapio-publico"] });
      queryClient.invalidateQueries({ queryKey: ["cardapio-categorias"] });
      toast.success("Categoria atualizada");
      setModalEditarOpen(false);
      setCategoriaEditando(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const excluirCategoria = useMutation({
    mutationFn: (id: string) => api.delete(`/api/estoque/categorias/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estoque"] });
      queryClient.invalidateQueries({ queryKey: ["estoque-categorias"] });
      queryClient.invalidateQueries({ queryKey: ["estoque-categorias-detalhes"] });
      queryClient.invalidateQueries({ queryKey: ["cardapio-publico"] });
      toast.success("Categoria excluída");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const categoriasComProdutos = useMemo(() => {
    const mapa = new Map<string, any[]>();
    for (const cat of categorias) mapa.set(cat.nome, []);
    for (const p of produtos) {
      if (!mapa.has(p.categoria)) mapa.set(p.categoria, []);
      mapa.get(p.categoria)?.push(p);
    }
    return Array.from(mapa.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [categorias, produtos]);

  const categoriasPorNome = useMemo(() => {
    const map = new Map<string, any>();
    for (const categoria of categorias) map.set(categoria.nome, categoria);
    return map;
  }, [categorias]);

  const abrirEditar = (nomeCategoriaAtual: string) => {
    // Categoria pode existir so via produtos (id nulo); ao salvar viramos ela formal.
    const categoria = categoriasPorNome.get(nomeCategoriaAtual) || { id: null, nome: nomeCategoriaAtual, acrescimoCartao: 0, imagemUrl: null };
    setCategoriaEditando(categoria);
    setNomeCategoriaEdit(categoria.nome);
    setAcrescimoCategoriaEdit(String(categoria.acrescimoCartao ?? 0));
    setImagemCategoriaEdit(categoria.imagemUrl ?? "");
    setModalEditarOpen(true);
  };

  const confirmarExclusaoCategoria = (nomeCategoriaAtual: string) => {
    const categoria = categoriasPorNome.get(nomeCategoriaAtual);
    if (!categoria?.id) {
      toast.error("Essa categoria ainda nao foi cadastrada formalmente.");
      return;
    }
    const ok = window.confirm(`Excluir a categoria "${nomeCategoriaAtual}"?`);
    if (!ok) return;
    excluirCategoria.mutate(categoria.id);
  };

  if (isLoadingProdutos || isLoadingCategorias) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground animate-pulse">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Estoque por Categoria</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {categoriasComProdutos.length} categorias · {produtos.length} produtos
          </p>
        </div>
        <Button onClick={() => { setNomeCategoria(""); setAcrescimoCategoria("0"); setImagemCategoria(""); setModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nova categoria
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {categoriasComProdutos.map(([cat, prods]) => {
          const categoriaMeta = categoriasPorNome.get(cat);
          const acrescimoCartao = Number(categoriaMeta?.acrescimoCartao || 0);
          const totalEstoque = prods.reduce((s, p) => s + p.estoque, 0);
          const emAlerta = prods.filter((p) => p.estoque <= p.estoqueMinimo).length;
          const disponiveis = prods.filter((p) => p.disponivel).length;
          const valorEstoque = prods.reduce((s, p) => s + p.preco * p.estoque, 0);

          return (
            <Card key={cat} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2 min-w-0">
                    {categoriaMeta?.imagemUrl ? (
                      <img
                        src={resolveImageUrl(categoriaMeta.imagemUrl) ?? undefined}
                        alt={cat}
                        className="h-8 w-8 flex-shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <Tags className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="truncate">{cat}</span>
                  </CardTitle>
                  {emAlerta > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 text-xs flex-shrink-0">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {emAlerta} alerta{emAlerta > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Adicional no cartao: <span className="font-medium text-foreground">{fmt(acrescimoCartao)}</span> por unidade
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Produtos</p>
                    <p className="font-bold">{prods.length}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Disponíveis</p>
                    <p className="font-bold">{disponiveis}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Estoque total</p>
                    <p className="font-bold">{totalEstoque} un.</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Valor em estoque</p>
                    <p className="font-bold text-primary">{fmt(valorEstoque)}</p>
                  </div>
                </div>

                <div className="space-y-1 border-t pt-2">
                  {prods.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem produtos nessa categoria.</p>
                  ) : (
                    prods.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-xs py-0.5">
                        <span className={`truncate flex-1 ${!p.disponivel ? "text-muted-foreground line-through" : ""}`}>
                          {p.nome}
                        </span>
                        <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                          {p.estoque <= p.estoqueMinimo && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                          <span className={`font-medium ${p.estoque === 0 ? "text-red-600" : p.estoque <= p.estoqueMinimo ? "text-amber-600" : ""}`}>
                            {p.estoque} un.
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => navigate(`/estoque/produtos?categoria=${encodeURIComponent(cat)}`)}
                >
                  Ver produtos
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => abrirEditar(cat)}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Editar categoria
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => confirmarExclusaoCategoria(cat)}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Excluir categoria
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova categoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nome da categoria *</Label>
            <Input
              value={nomeCategoria}
              onChange={(e) => setNomeCategoria(e.target.value)}
              placeholder="Ex: Vinhos Tintos"
            />
            <div className="space-y-1">
              <Label>Adicional no cartao (R$ por unidade)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={acrescimoCategoria}
                onChange={(e) => setAcrescimoCategoria(e.target.value)}
              />
            </div>
            <ImagemCategoriaField value={imagemCategoria} onChange={setImagemCategoria} />
            <p className="text-xs text-muted-foreground">
              A categoria criada vai aparecer automaticamente no dropdown de produtos.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                criarCategoria.mutate({
                  nome: nomeCategoria,
                  acrescimoCartao: Number(acrescimoCategoria || 0),
                  imagemUrl: imagemCategoria || undefined,
                })
              }
              disabled={!nomeCategoria.trim() || criarCategoria.isPending}
            >
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalEditarOpen} onOpenChange={setModalEditarOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar categoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nome da categoria *</Label>
            <Input
              value={nomeCategoriaEdit}
              onChange={(e) => setNomeCategoriaEdit(e.target.value)}
              placeholder="Nome da categoria"
            />
            <Label>Adicional no cartao (R$ por unidade)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={acrescimoCategoriaEdit}
              onChange={(e) => setAcrescimoCategoriaEdit(e.target.value)}
            />
            <ImagemCategoriaField value={imagemCategoriaEdit} onChange={setImagemCategoriaEdit} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalEditarOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                categoriaEditando &&
                atualizarCategoria.mutate({
                  id: categoriaEditando.id,
                  nome: nomeCategoriaEdit,
                  acrescimoCartao: Number(acrescimoCategoriaEdit || 0),
                  imagemUrl: imagemCategoriaEdit,
                })
              }
              disabled={!nomeCategoriaEdit.trim() || atualizarCategoria.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
