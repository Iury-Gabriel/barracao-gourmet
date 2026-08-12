import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, CreditCard, Plus, QrCode, Search, Trash2, Truck, Banknote } from "lucide-react";
import { toast } from "sonner";

interface ItemCarrinho {
  itemKey: string;
  produtoId: string;
  nome: string;
  preco: number;
  quantidade: number;
  variacaoNome?: string;
}

type FormaPagamento = "PIX" | "CARTAO_CREDITO" | "CARTAO_DEBITO" | "DINHEIRO" | "PAGAR_NA_ENTREGA";
type PagamentoEntrega = "CARTAO_CREDITO" | "DINHEIRO";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const PAGAMENTO_LABEL: Record<FormaPagamento | PagamentoEntrega, string> = {
  PIX: "PIX",
  CARTAO_CREDITO: "Cartao credito",
  CARTAO_DEBITO: "Cartao debito",
  DINHEIRO: "Dinheiro",
  PAGAR_NA_ENTREGA: "Pagar na entrega",
};

function montarItemKey(produtoId: string, variacaoNome?: string) {
  return `${produtoId}::${variacaoNome || "sem-variacao"}`;
}

export default function NovoPedidoPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [nomeCliente, setNomeCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [frete, setFrete] = useState("");
  const [tipo, setTipo] = useState("DELIVERY");
  const [observacoes, setObservacoes] = useState("");
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [busca, setBusca] = useState("");
  const [clienteId, setClienteId] = useState<string | undefined>();
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>("PIX");
  const [pagamentoEntrega, setPagamentoEntrega] = useState<PagamentoEntrega>("DINHEIRO");
  const [marcarComoEntregue, setMarcarComoEntregue] = useState(false);
  const [produtoSelecionandoVariacao, setProdutoSelecionandoVariacao] = useState<any>(null);
  const [variacaoSelecionada, setVariacaoSelecionada] = useState("");
  const [variacaoDialogOpen, setVariacaoDialogOpen] = useState(false);
  const [cupomInput, setCupomInput] = useState("");
  const [cupomAplicado, setCupomAplicado] = useState<{ codigo: string; valorDesconto: number } | null>(null);
  const [cupomValidando, setCupomValidando] = useState(false);
  const [cupomErro, setCupomErro] = useState("");
  const nomeClienteNormalizado = nomeCliente.trim();
  const nomeClienteFinal = nomeClienteNormalizado || "Desconhecido";

  const { data: produtosData } = useQuery({
    queryKey: ["estoque"],
    queryFn: () => api.get<any[]>("/api/estoque"),
  });

  const { data: clientesData } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => api.get<any[]>("/api/clientes"),
  });

  const { data: categoriasDetalhes = [] } = useQuery({
    queryKey: ["estoque-categorias-detalhes"],
    queryFn: () => api.get<any[]>("/api/estoque/categorias/detalhes"),
  });

  const produtos = produtosData ?? [];
  const clientes = clientesData ?? [];

  const produtosFiltrados = produtos.filter((produto) =>
    produto.nome.toLowerCase().includes(busca.toLowerCase()) && produto.estoque > 0,
  );

  const mapaCategoria = useMemo(
    () => new Map<string, number>(categoriasDetalhes.map((categoria: any) => [categoria.nome, Number(categoria.acrescimoCartao || 0)])),
    [categoriasDetalhes],
  );

  const pagamentoUsaCartao =
    formaPagamento === "CARTAO_CREDITO" ||
    formaPagamento === "CARTAO_DEBITO" ||
    (formaPagamento === "PAGAR_NA_ENTREGA" && pagamentoEntrega === "CARTAO_CREDITO");

  const obterVariacoesDisponiveis = (produto: any) => {
    const variacoes = Array.isArray(produto?.variacoes) ? produto.variacoes : [];
    if (!produto?.controlaEstoquePorVariacao) return variacoes;
    return variacoes.filter((variacao: any) => Number(variacao.estoque || 0) > 0);
  };

  const obterEstoqueDisponivel = (produto: any, variacaoNome?: string) => {
    if (!produto) return 0;
    if (produto.controlaEstoquePorVariacao && variacaoNome) {
      const variacao = (produto.variacoes || []).find((entry: any) => entry.nome === variacaoNome);
      return Number(variacao?.estoque || 0);
    }
    return Number(produto.estoque || 0);
  };

  const quantidadeAtualItem = (itemKey: string) => carrinho.find((item) => item.itemKey === itemKey)?.quantidade || 0;

  const adicionarItem = (produto: any, variacaoNome?: string) => {
    const itemKey = montarItemKey(produto.id, variacaoNome);
    const quantidadeAtual = quantidadeAtualItem(itemKey);
    const estoqueDisponivel = obterEstoqueDisponivel(produto, variacaoNome);

    if (estoqueDisponivel <= quantidadeAtual) {
      toast.error("Estoque maximo desse item ja atingido.");
      return;
    }

    setCarrinho((prev) => {
      const existente = prev.find((item) => item.itemKey === itemKey);
      if (existente) {
        return prev.map((item) => item.itemKey === itemKey ? { ...item, quantidade: item.quantidade + 1 } : item);
      }
      return [
        ...prev,
        {
          itemKey,
          produtoId: produto.id,
          nome: produto.nome,
          preco: produto.preco,
          quantidade: 1,
          variacaoNome,
        },
      ];
    });
  };

  const abrirSelecaoDeVariacao = (produto: any) => {
    const variacoesDisponiveis = obterVariacoesDisponiveis(produto);
    if (variacoesDisponiveis.length === 0) {
      toast.error("Nao ha sabores com estoque disponivel para esse produto.");
      return;
    }
    setProdutoSelecionandoVariacao(produto);
    setVariacaoSelecionada("");
    setVariacaoDialogOpen(true);
  };

  const confirmarVariacao = () => {
    if (!produtoSelecionandoVariacao || !variacaoSelecionada) return;
    adicionarItem(produtoSelecionandoVariacao, variacaoSelecionada);
    setVariacaoDialogOpen(false);
    setProdutoSelecionandoVariacao(null);
    setVariacaoSelecionada("");
  };

  const removerItem = (itemKey: string) => {
    setCarrinho((prev) => prev.filter((item) => item.itemKey !== itemKey));
  };

  const alterarQtd = (itemKey: string, qtd: number) => {
    if (qtd <= 0) {
      removerItem(itemKey);
      return;
    }

    const item = carrinho.find((entry) => entry.itemKey === itemKey);
    const produto = produtos.find((entry) => entry.id === item?.produtoId);
    if (!item || !produto) return;

    const estoqueDisponivel = obterEstoqueDisponivel(produto, item.variacaoNome);
    if (qtd > estoqueDisponivel) {
      toast.error("Quantidade acima do estoque disponivel.");
      return;
    }

    setCarrinho((prev) => prev.map((entry) => entry.itemKey === itemKey ? { ...entry, quantidade: qtd } : entry));
  };

  const total = carrinho.reduce((sum, item) => sum + item.preco * item.quantidade, 0);
  const adicionalCartao = pagamentoUsaCartao
    ? carrinho.reduce((sum, item) => {
        const produto = produtos.find((entry) => entry.id === item.produtoId);
        if (!produto) return sum;
        return sum + (mapaCategoria.get(produto.categoria) || 0) * item.quantidade;
      }, 0)
    : 0;
  // Cliente com isencao de frete no cadastro: o backend zera o frete de qualquer
  // jeito, entao a tela ja reflete isso para o operador nao cobrar por engano.
  const clienteSelecionado = clientes.find((c) => c.id === clienteId);
  const entregaGratisCliente = Boolean(clienteSelecionado?.entregaGratis);
  const freteValor = tipo === "DELIVERY" && !entregaGratisCliente ? Number(frete || 0) : 0;
  const descontoCupom = cupomAplicado?.valorDesconto || 0;
  const totalFinal = Math.max(0, Number((total + adicionalCartao + freteValor - descontoCupom).toFixed(2)));

  const aplicarCupom = async () => {
    const codigo = cupomInput.trim().toUpperCase();
    if (!codigo) return;
    setCupomValidando(true);
    setCupomErro("");
    try {
      const data: any = await api.post("/api/cupons/validar", { codigo, subtotal: total, telefoneCliente: telefone || undefined });
      if (!data.valido) {
        setCupomAplicado(null);
        setCupomErro(data.motivo || "Cupom invalido.");
        return;
      }
      setCupomAplicado({ codigo: data.cupom.codigo, valorDesconto: data.valorDesconto });
      setCupomInput(data.cupom.codigo);
      toast.success(`Cupom ${data.cupom.codigo} aplicado`);
    } catch (err: any) {
      setCupomErro(err.message || "Nao foi possivel validar o cupom.");
    } finally {
      setCupomValidando(false);
    }
  };

  const removerCupom = () => {
    setCupomAplicado(null);
    setCupomInput("");
    setCupomErro("");
  };

  const selecionarCliente = (id: string) => {
    const cliente = clientes.find((entry: any) => entry.id === id);
    if (!cliente) return;
    setClienteId(cliente.id);
    setNomeCliente(cliente.nome);
    setTelefone(cliente.telefone ?? "");
    setCep(cliente.cep ?? "");
    setEndereco(cliente.endereco ?? "");
  };

  const limparCliente = () => {
    setClienteId(undefined);
    setNomeCliente("");
    setTelefone("");
    setCep("");
    setEndereco("");
  };

  const criarPedido = useMutation({
    mutationFn: () => api.post("/api/pedidos", {
      clienteId,
      nomeCliente: nomeClienteNormalizado || undefined,
      telefoneCliente: telefone,
      cepEntrega: cep,
      enderecoEntrega: endereco,
      frete: tipo === "DELIVERY" ? freteValor : 0,
      tipo,
      criarComoEntregue: marcarComoEntregue,
      pagamento: formaPagamento,
      pagamentoEntregaMetodo: formaPagamento === "PAGAR_NA_ENTREGA" ? pagamentoEntrega : undefined,
      observacoes,
      cupomCodigo: cupomAplicado?.codigo,
      itens: carrinho.map((item) => ({
        produtoId: item.produtoId,
        quantidade: item.quantidade,
        variacaoNome: item.variacaoNome,
      })),
    }),
    onSuccess: (pedido: any) => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      queryClient.invalidateQueries({ queryKey: ["estoque"] });
      toast.success(
        marcarComoEntregue
          ? `Pedido #${pedido.numero} criado e marcado como entregue!`
          : `Pedido #${pedido.numero} criado com sucesso!`,
      );
      navigate("/pedidos");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pedidos")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Novo Pedido</h1>
          <p className="text-sm text-muted-foreground">Monte o pedido rapido e, se quiser, identifique o cliente depois.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Cliente e Entrega</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-sm font-medium">Pedido sem cliente identificado</p>
              <p className="text-xs text-muted-foreground">
                Se voce nao preencher nome, telefone ou cliente cadastrado, o pedido sera salvo como <span className="font-semibold">Desconhecido</span>.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Cliente cadastrado (opcional)</Label>
              <Select value={clienteId} onValueChange={selecionarCliente}>
                <SelectTrigger>
                  <SelectValue placeholder="Buscar cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((cliente: any) => (
                    <SelectItem key={cliente.id} value={cliente.id}>
                      {cliente.nome} - {cliente.telefone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clienteId && (
                <Button type="button" variant="ghost" className="h-auto px-0 text-xs text-muted-foreground" onClick={limparCliente}>
                  Remover cliente selecionado e salvar como desconhecido
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label>Nome do cliente (opcional)</Label>
              <Input value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)} placeholder="Se deixar em branco, sera Desconhecido" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Opcional" />
              </div>
              <div className="space-y-2">
                <Label>CEP</Label>
                <Input value={cep} onChange={(e) => setCep(e.target.value)} placeholder="00000-000" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipo de Pedido</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DELIVERY">Delivery</SelectItem>
                  <SelectItem value="RETIRADA">Retirada</SelectItem>
                  <SelectItem value="LOCAL">Consumo Local</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {tipo === "DELIVERY" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Endereco de Entrega</Label>
                  <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, numero, bairro" />
                </div>
                <div className="space-y-2">
                  <Label>Valor do Frete</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={entregaGratisCliente ? "" : frete}
                    onChange={(e) => setFrete(e.target.value)}
                    placeholder={entregaGratisCliente ? "Grátis" : "0,00"}
                    disabled={entregaGratisCliente}
                  />
                  {entregaGratisCliente && (
                    <p className="flex items-center gap-1 text-xs text-primary">
                      <Truck className="h-3 w-3" />
                      Cliente com entrega grátis — frete não será cobrado.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Cupom de desconto</Label>
              {cupomAplicado ? (
                <div className="flex items-center justify-between rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-3 py-2">
                  <p className="text-sm font-medium text-emerald-700">
                    {cupomAplicado.codigo} · desconto de {fmt(cupomAplicado.valorDesconto)}
                  </p>
                  <Button type="button" variant="ghost" size="sm" onClick={removerCupom}>Remover</Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    className="font-mono"
                    value={cupomInput}
                    onChange={(e) => setCupomInput(e.target.value.toUpperCase())}
                    placeholder="Codigo do cupom (opcional)"
                  />
                  <Button type="button" variant="outline" disabled={!cupomInput.trim() || cupomValidando} onClick={aplicarCupom}>
                    {cupomValidando ? "..." : "Aplicar"}
                  </Button>
                </div>
              )}
              {cupomErro && !cupomAplicado && <p className="text-xs text-destructive">{cupomErro}</p>}
            </div>

            <div className="space-y-2">
              <Label>Observacoes</Label>
              <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Observacoes do pedido..." rows={2} />
            </div>

            <div className="rounded-lg border border-dashed px-3 py-2">
              <p className="text-xs text-muted-foreground">
                Cliente que sera salvo neste pedido: <span className="font-semibold text-foreground">{nomeClienteFinal}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Produtos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar produto..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div className="max-h-[32rem] space-y-1 overflow-y-auto">
              {produtosFiltrados.map((produto) => {
                const temVariacoes = Array.isArray(produto.variacoes) && produto.variacoes.length > 0;
                const resumoVariacoes = obterVariacoesDisponiveis(produto)
                  .map((variacao: any) => produto.controlaEstoquePorVariacao ? `${variacao.nome} (${variacao.estoque ?? 0})` : variacao.nome)
                  .join(", ");

                return (
                  <button
                    key={produto.id}
                    onClick={() => temVariacoes ? abrirSelecaoDeVariacao(produto) : adicionarItem(produto)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <div>
                      <p className="text-sm font-medium">{produto.nome}</p>
                      <p className="text-xs text-muted-foreground">{produto.categoria} - estoque: {produto.estoque}</p>
                      {resumoVariacoes && (
                        <p className="text-xs text-muted-foreground">
                          {produto.tipoVariacao || "Variacoes"}: {resumoVariacoes}
                        </p>
                      )}
                      {temVariacoes && (
                        <p className="text-xs font-medium text-primary">Clique para escolher o sabor</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-primary">{fmt(produto.preco)}</span>
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Pagamento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            {[
              { value: "PIX", icon: QrCode },
              { value: "CARTAO_CREDITO", icon: CreditCard },
              { value: "CARTAO_DEBITO", icon: CreditCard },
              { value: "DINHEIRO", icon: Banknote },
              { value: "PAGAR_NA_ENTREGA", icon: Truck },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFormaPagamento(item.value as FormaPagamento)}
                className={`rounded-xl border p-3 text-left transition-colors ${formaPagamento === item.value ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
              >
                <item.icon className="mb-2 h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">{PAGAMENTO_LABEL[item.value as FormaPagamento]}</p>
              </button>
            ))}
          </div>

          {formaPagamento === "PAGAR_NA_ENTREGA" && (
            <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
              <Label>Pagamento na entrega</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={pagamentoEntrega === "CARTAO_CREDITO" ? "default" : "outline"} onClick={() => setPagamentoEntrega("CARTAO_CREDITO")}>
                  Cartao
                </Button>
                <Button type="button" variant={pagamentoEntrega === "DINHEIRO" ? "default" : "outline"} onClick={() => setPagamentoEntrega("DINHEIRO")}>
                  Dinheiro
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {carrinho.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Resumo do Pedido</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {carrinho.map((item) => (
                <div key={item.itemKey} className="flex items-center gap-3 border-b py-2 last:border-0">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.nome}</p>
                    {item.variacaoNome && <p className="text-xs text-muted-foreground">Sabor: {item.variacaoNome}</p>}
                    <p className="text-xs text-muted-foreground">{fmt(item.preco)} cada</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => alterarQtd(item.itemKey, item.quantidade - 1)}>-</Button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantidade}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => alterarQtd(item.itemKey, item.quantidade + 1)}>+</Button>
                  </div>
                  <span className="w-20 text-right text-sm font-bold">{fmt(item.preco * item.quantidade)}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removerItem(item.itemKey)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center justify-between pt-3 text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">{fmt(totalFinal)}</span>
              </div>
              {tipo === "DELIVERY" && (
                <p className="text-xs text-muted-foreground">
                  Frete: {entregaGratisCliente ? "grátis (cliente isento)" : fmt(freteValor)}
                </p>
              )}
              {pagamentoUsaCartao && <p className="text-xs text-muted-foreground">Inclui adicional de cartao: {fmt(adicionalCartao)}</p>}
              {cupomAplicado && <p className="text-xs text-emerald-700">Desconto ({cupomAplicado.codigo}): -{fmt(descontoCupom)}</p>}
            </div>
            <div className="mt-4 rounded-xl border bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="marcar-como-entregue"
                  checked={marcarComoEntregue}
                  onCheckedChange={(checked) => setMarcarComoEntregue(checked === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="marcar-como-entregue" className="cursor-pointer">Ja marcar como entregue</Label>
                  <p className="text-xs text-muted-foreground">
                    Se ativar, o pedido ja sera salvo com status de entregue e nao precisara passar pelo pipeline.
                  </p>
                </div>
              </div>
            </div>
            <Button className="mt-4 w-full" size="lg" disabled={carrinho.length === 0 || criarPedido.isPending} onClick={() => criarPedido.mutate()}>
              {criarPedido.isPending ? "Criando pedido..." : "Confirmar Pedido"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={variacaoDialogOpen} onOpenChange={setVariacaoDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Escolha o sabor</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{produtoSelecionandoVariacao?.nome}</p>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {obterVariacoesDisponiveis(produtoSelecionandoVariacao).map((variacao: any) => (
              <button
                key={`${variacao.nome}-${variacao.ordem ?? 0}`}
                type="button"
                onClick={() => setVariacaoSelecionada(variacao.nome)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${variacaoSelecionada === variacao.nome ? "border-primary bg-primary/10" : "hover:border-primary/50"}`}
              >
                <p className="text-sm font-medium">{variacao.nome}</p>
                <p className="text-xs text-muted-foreground">Estoque: {variacao.estoque ?? 0}</p>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVariacaoDialogOpen(false)}>Cancelar</Button>
            <Button disabled={!variacaoSelecionada} onClick={confirmarVariacao}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
