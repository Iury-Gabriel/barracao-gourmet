import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { resolveImageUrl } from "@/lib/media";
import { API_URL } from "@/lib/apiBaseUrl";
import { CardFormMercadoPago, type CartaoTokenizado } from "./CardFormMercadoPago";
import { tokenizarCartaoSalvo } from "@/lib/mercadopago";
import {
  Wine, ShoppingCart, Plus, Minus, Trash2, CheckCircle,
  CreditCard, QrCode, Copy, Clock, Truck, ArrowRight, ArrowLeft, MessageCircle, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";

interface ItemCarrinho {
  itemKey: string;
  produtoId: string;
  nome: string;
  variacaoNome?: string;
  preco: number;
  quantidade: number;
  imagemUrl?: string;
}

interface FreteInfo {
  atende: boolean;
  frete: number;
  // Cliente marcado com "entrega gratis" no cadastro: frete zerado pelo backend.
  entregaGratis?: boolean;
  distanciaKm: number;
  enderecoDestinoNormalizado?: string;
  motivo?: string;
  acimaDoLimite?: boolean;
  mensagemForaDeArea?: string;
  enderecoRetirada?: string;
}

type FormaPagamento = "PIX" | "CARTAO_CREDITO" | "CARTAO_DEBITO" | "DINHEIRO" | "PAGAR_NA_ENTREGA";
type PagamentoEntrega = "CARTAO_CREDITO" | "DINHEIRO";
type ImageTone = "light" | "dark";

const darkInputClass = "border-marrom-700 bg-marrom-900 text-white placeholder:text-marrom-500 focus-visible:ring-marrom-500";
const darkSelectClass = "border-marrom-700 bg-marrom-900 text-white";
const darkOutlineButtonClass = "border-marrom-700 bg-marrom-900 text-white hover:bg-marrom-800 hover:text-white";
// CTA principal do cardapio: vermelho da marca sobre branco.
const accentButtonClass = "bg-vermelho-600 text-white hover:bg-vermelho-500";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Corrige typos comuns e inequivocos de TLD (".con"/".comm" nao existem de verdade,
// entao e seguro corrigir sem risco de mexer num dominio valido por engano).
function corrigirTypoEmail(email: string) {
  return email.replace(/\.(con|comm)$/i, ".com");
}

function pagamentoUsaCartao(formaPagamento: FormaPagamento, pagamentoEntrega: PagamentoEntrega) {
  if (formaPagamento === "CARTAO_CREDITO" || formaPagamento === "CARTAO_DEBITO") return true;
  if (formaPagamento === "PAGAR_NA_ENTREGA") return pagamentoEntrega === "CARTAO_CREDITO";
  return false;
}

const STATUS_LABEL: Record<string, string> = {
  RECEBIDO: "Recebido",
  EM_PREPARO: "Em preparação",
  PRONTO: "Pronto",
  EM_ENTREGA: "Para entrega",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

const PAGAMENTO_LABEL: Record<string, string> = {
  PIX: "PIX",
  CARTAO_CREDITO: "Cartão crédito",
  CARTAO_DEBITO: "Cartão débito",
  DINHEIRO: "Dinheiro",
  PAGAR_NA_ENTREGA: "Pagar na entrega",
};

const STATUS_BADGE: Record<string, string> = {
  RECEBIDO: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  EM_PREPARO: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  PRONTO: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  EM_ENTREGA: "bg-vermelho-500/15 text-vermelho-300 border-vermelho-500/30",
  ENTREGUE: "bg-marrom-500/15 text-marrom-200 border-marrom-500/30",
  CANCELADO: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

function analisarTomDaImagem(imageUrl: string): Promise<ImageTone> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve("dark");
          return;
        }

        const size = 24;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        const { data } = ctx.getImageData(0, 0, size, size);
        let luminanciaTotal = 0;
        const pixels = data.length / 4;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          luminanciaTotal += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }

        const media = luminanciaTotal / pixels;
        resolve(media > 145 ? "light" : "dark");
      } catch {
        resolve("dark");
      }
    };

    img.onerror = () => resolve("dark");
    img.src = imageUrl;
  });
}

function DetalhePedidoCliente({ pedidoId }: { pedidoId: string }) {
  const [pollar, setPollar] = useState(true);

  const { data: pedido, isLoading } = useQuery({
    queryKey: ["cardapio-pedido-detalhe", pedidoId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/cardapio/pedido/${pedidoId}`);
      if (!res.ok) throw new Error("Falha ao buscar detalhes");
      return res.json();
    },
    refetchInterval: pollar ? 12000 : false,
  });

  useEffect(() => {
    const s = pedido?.status;
    if (s) setPollar(!["ENTREGUE", "CANCELADO"].includes(s));
  }, [pedido?.status]);

  if (isLoading || !pedido) {
    return <p className="mt-2 text-xs text-marrom-300">Carregando detalhes...</p>;
  }

  const itens: any[] = Array.isArray(pedido.itens) ? pedido.itens : [];
  const historico: any[] = Array.isArray(pedido.historico) ? pedido.historico : [];
  const subtotalItens = itens.reduce((acc, i) => acc + Number(i.subtotal || 0), 0);
  const total = Number(pedido.total || 0);
  const frete = pedido.tipo === "DELIVERY" ? Math.max(0, Number((total - subtotalItens).toFixed(2))) : 0;
  const finalizado = ["ENTREGUE", "CANCELADO"].includes(pedido.status);

  return (
    <div className="mt-3 space-y-3 border-t border-marrom-800 pt-3">
      {!finalizado && (
        <div className="flex items-center gap-2 text-xs text-emerald-300">
          <span className="flex h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Acompanhando o status em tempo real...
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold text-marrom-200">Andamento</p>
        <div className="space-y-1">
          {historico.length === 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-marrom-100">{STATUS_LABEL[pedido.status] || pedido.status}</span>
            </div>
          )}
          {historico.map((h, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs">
              <span className="text-marrom-100">{STATUS_LABEL[h.status] || h.status}</span>
              <span className="text-marrom-500">
                {new Date(h.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {pedido.tipo === "DELIVERY" && pedido.enderecoEntrega && (
        <div className="text-xs text-marrom-200">
          <span className="font-semibold">Entrega: </span>
          {pedido.enderecoEntrega}
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold text-marrom-200">Itens</p>
        <div className="space-y-0.5 text-xs text-marrom-100">
          {itens.map((i, idx) => (
            <div key={idx} className="flex justify-between gap-2">
              <span>
                {i.quantidade}x {i.produto?.nome || "Item"}
                {i.variacaoNome ? ` (${i.variacaoNome})` : ""}
              </span>
              <span className="whitespace-nowrap">{fmt(Number(i.subtotal || 0))}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-0.5 text-xs">
        <div className="flex justify-between text-marrom-300">
          <span>Subtotal</span>
          <span>{fmt(subtotalItens)}</span>
        </div>
        {pedido.tipo === "DELIVERY" && (
          <div className="flex justify-between text-marrom-300">
            <span>Frete</span>
            <span>{fmt(frete)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-white">
          <span>Total</span>
          <span className="text-primary">{fmt(total)}</span>
        </div>
        <div className="flex justify-between text-marrom-300">
          <span>Pagamento</span>
          <span>
            {PAGAMENTO_LABEL[pedido.pagamento] || pedido.pagamento || "-"}
            {pedido.statusPagamento === "PAGO" ? " (pago)" : ""}
          </span>
        </div>
      </div>

      {pedido.observacoes && (
        <p className="text-xs text-marrom-300">
          <span className="font-semibold">Obs: </span>
          {pedido.observacoes}
        </p>
      )}
    </div>
  );
}

function MeusPedidosSheet({
  open,
  onOpenChange,
  contatoInicial,
  themeVars,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contatoInicial: { telefone: string; email: string };
  themeVars: CSSProperties;
}) {
  const [contato, setContato] = useState(contatoInicial);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  useEffect(() => {
    if (open) setContato(contatoInicial);
  }, [open, contatoInicial]);

  const tel = (contato.telefone || "").replace(/\D/g, "");
  const email = (contato.email || "").trim();
  const podeBuscar = tel.length >= 10 || /.+@.+\..+/.test(email);

  const { data, isLoading } = useQuery({
    queryKey: ["meus-pedidos", tel, email.toLowerCase()],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (tel.length >= 10) qs.set("telefone", tel);
      if (/.+@.+\..+/.test(email)) qs.set("email", email);
      const res = await fetch(`${API_URL}/api/cardapio/meus-pedidos?${qs.toString()}`);
      if (!res.ok) throw new Error("Falha ao buscar pedidos");
      return res.json() as Promise<{ pedidos: any[] }>;
    },
    enabled: open && podeBuscar,
    refetchInterval: open ? 15000 : false,
  });

  const pedidos = data?.pedidos ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto border-marrom-800 bg-marrom-950 text-white sm:max-w-lg" style={themeVars}>
        <SheetHeader>
          <SheetTitle className="text-white">Meus pedidos</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-white">Telefone</Label>
            <Input
              className={darkInputClass}
              value={contato.telefone}
              onChange={(e) => setContato((c) => ({ ...c, telefone: e.target.value }))}
              placeholder="(11) 99999-9999"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-white">ou E-mail</Label>
            <Input
              className={darkInputClass}
              value={contato.email}
              onChange={(e) => setContato((c) => ({ ...c, email: e.target.value }))}
              placeholder="voce@email.com"
            />
          </div>
          {!podeBuscar && (
            <p className="text-xs text-marrom-300">Informe o telefone ou o e-mail usado nos pedidos para ver o andamento.</p>
          )}
        </div>

        <div className="mt-5 space-y-3">
          {isLoading && <p className="text-sm text-marrom-300">Carregando...</p>}
          {!isLoading && podeBuscar && pedidos.length === 0 && (
            <p className="text-sm text-marrom-300">Nenhum pedido encontrado para esse contato.</p>
          )}
          {pedidos.map((p) => (
            <div key={p.id} className="rounded-xl border border-marrom-800 bg-marrom-900/70 p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Pedido #{p.numero}</span>
                <Badge className={`border ${STATUS_BADGE[p.status] || "bg-marrom-700 text-marrom-100"}`}>
                  {STATUS_LABEL[p.status] || p.status}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-marrom-300">
                {new Date(p.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                {" · "}
                {p.tipo === "DELIVERY" ? "Delivery" : "Retirada"}
              </p>
              <div className="mt-2 space-y-0.5 text-sm text-marrom-100">
                {(p.itens || []).map((i: any, idx: number) => (
                  <div key={idx}>
                    {i.quantidade}x {i.nome}
                    {i.variacaoNome ? ` (${i.variacaoNome})` : ""}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-marrom-800 pt-2 text-sm">
                <span className="text-marrom-300">Total</span>
                <span className="font-bold text-primary">{fmt(Number(p.total || 0))}</span>
              </div>
              <button
                className="mt-2 text-xs font-medium text-primary hover:underline"
                onClick={() => setExpandidoId((id) => (id === p.id ? null : p.id))}
              >
                {expandidoId === p.id ? "Ocultar detalhes" : "Ver mais detalhes"}
              </button>
              {expandidoId === p.id && <DetalhePedidoCliente pedidoId={p.id} />}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function CardapioPage() {
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [carrinhoOpen, setCarrinhoOpen] = useState(false);
  const [pedidoConfirmado, setPedidoConfirmado] = useState<any>(null);
  const [etapa, setEtapa] = useState<"carrinho" | "dados" | "pagamento" | "confirmado">("carrinho");
  const [form, setForm] = useState({
    nomeCliente: "",
    telefoneCliente: "",
    emailCliente: "",
    cepEntrega: "",
    enderecoEntrega: "",
    numeroEntrega: "",
    tipo: "DELIVERY",
    observacoes: "",
  });
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>("PIX");
  const [pagamentoEntrega, setPagamentoEntrega] = useState<PagamentoEntrega>("DINHEIRO");
  const [precisaTrocoEntrega, setPrecisaTrocoEntrega] = useState<boolean | null>(null);
  const [valorTrocoPara, setValorTrocoPara] = useState("");
  const [pixCopiado, setPixCopiado] = useState(false);
  const [categoriaAtiva, setCategoriaAtiva] = useState<string | null>(null);
  const [promptNovoItemOpen, setPromptNovoItemOpen] = useState(false);
  const [variacaoDialogOpen, setVariacaoDialogOpen] = useState(false);
  const [produtoSelecionandoVariacao, setProdutoSelecionandoVariacao] = useState<any>(null);
  const [variacaoSelecionada, setVariacaoSelecionada] = useState("");
  const [imageToneByUrl, setImageToneByUrl] = useState<Record<string, ImageTone>>({});
  const [freteInfo, setFreteInfo] = useState<FreteInfo | null>(null);
  const [freteLoading, setFreteLoading] = useState(false);
  const [freteErro, setFreteErro] = useState("");
  const [foraDeAreaModalOpen, setForaDeAreaModalOpen] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState<{ url: string; nome: string } | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepErro, setCepErro] = useState("");
  const [meusPedidosOpen, setMeusPedidosOpen] = useState(false);
  const [buscaContato, setBuscaContato] = useState<{ telefone: string; email: string }>(() => {
    try {
      return JSON.parse(localStorage.getItem("barracao_cliente") || "{}");
    } catch {
      return { telefone: "", email: "" };
    }
  });
  const autofillRef = useRef<string>("");
  const [cartoesSalvos, setCartoesSalvos] = useState<any[]>([]);
  const [cartaoModo, setCartaoModo] = useState<"novo" | string>("novo"); // "novo" ou o id do cartao salvo
  const [cvvSalvo, setCvvSalvo] = useState("");
  const [salvarCartao, setSalvarCartao] = useState(true);
  const [processandoSalvo, setProcessandoSalvo] = useState(false);
  const [cupomInput, setCupomInput] = useState("");
  const [cupomAplicado, setCupomAplicado] = useState<{ codigo: string; tipo: string; valor: number; valorDesconto: number } | null>(null);
  const [cupomValidando, setCupomValidando] = useState(false);
  const [cupomErro, setCupomErro] = useState("");
  const cupomUrlRef = useRef<string | null>(null);

  const { data: produtos = [], isLoading } = useQuery({
    queryKey: ["cardapio-publico"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/cardapio?todos=true`);
      return res.json();
    },
  });

  const { data: statusLoja } = useQuery({
    queryKey: ["cardapio-status-loja"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/loja/status`);
      return res.json();
    },
    refetchInterval: 60000,
  });
  const lojaFechada = !!statusLoja?.lojaFechada;
  const mensagemLojaFechada = statusLoja?.mensagemFechado || "A loja está fechada no momento. Tente novamente mais tarde.";

  const { data: pedidoAtual } = useQuery({
    queryKey: ["cardapio-pedido-status", pedidoConfirmado?.id],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/cardapio/pedido/${pedidoConfirmado.id}`);
      return res.json();
    },
    enabled: !!pedidoConfirmado?.id,
    refetchInterval: 10000,
  });

  // Capas cadastradas por categoria (definidas no admin). Tem prioridade sobre a foto do produto.
  const { data: categoriasCapas = [] } = useQuery({
    queryKey: ["cardapio-categorias"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/cardapio/categorias`);
      return res.json();
    },
  });
  const capaPorCategoria = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of categoriasCapas as any[]) {
      if (c?.nome && c?.imagemUrl) mapa.set(c.nome, c.imagemUrl);
    }
    return mapa;
  }, [categoriasCapas]);

  // Agrupa os produtos por categoria. Usa a capa cadastrada da categoria; se nao houver,
  // cai para a imagem do primeiro produto com foto.
  const categoriasComImagem = useMemo(() => {
    const mapa = new Map<string, { nome: string; imagemUrl?: string; total: number }>();
    for (const p of produtos as any[]) {
      const cat = p.categoria || "Outros";
      if (!mapa.has(cat)) mapa.set(cat, { nome: cat, imagemUrl: undefined, total: 0 });
      const entry = mapa.get(cat)!;
      entry.total += 1;
      if (!entry.imagemUrl && p.imagemUrl) entry.imagemUrl = p.imagemUrl;
    }
    // Sobrepoe com a capa cadastrada quando existir.
    for (const entry of mapa.values()) {
      const capa = capaPorCategoria.get(entry.nome);
      if (capa) entry.imagemUrl = capa;
    }
    return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [produtos, capaPorCategoria]);
  const produtosFiltrados = categoriaAtiva ? (produtos as any[]).filter((p: any) => p.categoria === categoriaAtiva) : [];

  useEffect(() => {
    const urls = produtos
      .map((produto: any) => resolveImageUrl(produto.imagemUrl))
      .filter((url: string | null): url is string => Boolean(url))
      .filter((url: string) => !(url in imageToneByUrl));

    if (urls.length === 0) return;

    let ativo = true;

    Promise.all(urls.map(async (url) => [url, await analisarTomDaImagem(url)] as const)).then((resultados) => {
      if (!ativo) return;
      setImageToneByUrl((prev) => {
        const next = { ...prev };
        for (const [url, tone] of resultados) {
          next[url] = tone;
        }
        return next;
      });
    });

    return () => {
      ativo = false;
    };
  }, [produtos, imageToneByUrl]);

  const pagamentoDinheiroEntrega = formaPagamento === "PAGAR_NA_ENTREGA" && pagamentoEntrega === "DINHEIRO";

  useEffect(() => {
    if (!pagamentoDinheiroEntrega) {
      setPrecisaTrocoEntrega(null);
      setValorTrocoPara("");
    }
  }, [pagamentoDinheiroEntrega]);

  const totalCarrinho = carrinho.reduce((s, i) => s + i.preco * i.quantidade, 0);
  const qtdCarrinho = carrinho.reduce((s, i) => s + i.quantidade, 0);
  const acrescimoCartaoCarrinho = carrinho.reduce((soma, item) => {
    const produto = produtos.find((p: any) => p.id === item.produtoId);
    const acrescimo = Number(produto?.acrescimoCartaoCategoria || 0);
    return soma + acrescimo * item.quantidade;
  }, 0);
  const adicionalCartao = pagamentoUsaCartao(formaPagamento, pagamentoEntrega) ? acrescimoCartaoCarrinho : 0;
  const freteAtual = form.tipo === "DELIVERY" ? Number(freteInfo?.frete || 0) : 0;
  const descontoCupom = cupomAplicado?.valorDesconto || 0;
  const totalComFrete = Math.max(0, Number((totalCarrinho + freteAtual + adicionalCartao - descontoCupom).toFixed(2)));

  // Le o cupom da URL (?cupom=CODIGO) uma unica vez, ao carregar a pagina.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codigoUrl = params.get("cupom");
    if (codigoUrl) cupomUrlRef.current = codigoUrl.trim().toUpperCase();
  }, []);

  const aplicarCupom = async (codigoParam?: string, opts?: { silent?: boolean }) => {
    const codigo = (codigoParam ?? cupomInput).trim().toUpperCase();
    if (!codigo) return;
    setCupomValidando(true);
    if (!opts?.silent) setCupomErro("");
    try {
      const res = await fetch(`${API_URL}/api/cupons/validar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, subtotal: totalCarrinho, telefoneCliente: form.telefoneCliente || undefined, formaPagamento, tipoPedido: form.tipo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.valido) {
        setCupomAplicado(null);
        const motivo = data.motivo || "Cupom inválido ou expirado.";
        setCupomErro(motivo);
        if (!opts?.silent) toast.error(motivo);
        return;
      }
      setCupomAplicado({ codigo: data.cupom.codigo, tipo: data.cupom.tipo, valor: data.cupom.valor, valorDesconto: data.valorDesconto });
      setCupomInput(data.cupom.codigo);
      setCupomErro("");
      if (!opts?.silent) toast.success(`Cupom ${data.cupom.codigo} aplicado — desconto de ${fmt(data.valorDesconto)}`);
    } catch {
      if (!opts?.silent) { setCupomErro("Não foi possível validar o cupom agora."); toast.error("Não foi possível validar o cupom agora."); }
    } finally {
      setCupomValidando(false);
    }
  };

  const removerCupom = () => {
    setCupomAplicado(null);
    setCupomInput("");
    setCupomErro("");
  };

  // Aplica automaticamente o cupom da URL assim que houver itens no carrinho, e mantem
  // o desconto sincronizado (ex: percentual muda) sempre que o subtotal do carrinho mudar.
  useEffect(() => {
    if (totalCarrinho <= 0) {
      if (cupomAplicado) removerCupom();
      return;
    }
    if (cupomAplicado) {
      aplicarCupom(cupomAplicado.codigo, { silent: true });
      return;
    }
    if (cupomUrlRef.current) {
      const codigo = cupomUrlRef.current;
      cupomUrlRef.current = null;
      setCupomInput(codigo);
      aplicarCupom(codigo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCarrinho, formaPagamento, form.tipo]);

  // Autofill: ao preencher telefone ou email, busca dados de pedidos anteriores e preenche o resto.
  useEffect(() => {
    const tel = (form.telefoneCliente || "").replace(/\D/g, "");
    const email = (form.emailCliente || "").trim();
    const temTel = tel.length >= 10;
    const temEmail = /.+@.+\..+/.test(email);
    if (!temTel && !temEmail) return;

    const chave = `${temTel ? tel : ""}|${temEmail ? email.toLowerCase() : ""}`;
    if (autofillRef.current === chave) return; // ja buscou para esse contato

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const qs = new URLSearchParams();
        if (temTel) qs.set("telefone", tel);
        if (temEmail) qs.set("email", email);
        const res = await fetch(`${API_URL}/api/cardapio/cliente?${qs.toString()}`, { signal: controller.signal });
        if (!res.ok) return;
        const c = await res.json().catch(() => null);
        if (!c) return;
        autofillRef.current = chave;
        // Preenche apenas os campos ainda vazios, sem sobrescrever o que o cliente digitou.
        setForm((f) => {
          const next = { ...f };
          if (!next.nomeCliente && c.nome) next.nomeCliente = c.nome;
          if (!next.emailCliente && c.email) next.emailCliente = c.email;
          if (!next.telefoneCliente && c.telefone) next.telefoneCliente = c.telefone;
          if (!next.cepEntrega && c.cep) next.cepEntrega = c.cep; // dispara o autofill de endereco pelo CEP
          if (!next.numeroEntrega && c.endereco) {
            const num = String(c.endereco).match(/\d{1,6}/);
            if (num) next.numeroEntrega = num[0];
          }
          return next;
        });
      } catch {
        /* ignore */
      }
    }, 600);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [form.telefoneCliente, form.emailCliente]);

  // Ao preencher o CEP, busca o endereco oficial e preenche o campo de endereco automaticamente.
  useEffect(() => {
    if (form.tipo !== "DELIVERY") {
      setCepErro("");
      setCepLoading(false);
      return;
    }
    const cep = (form.cepEntrega || "").replace(/\D/g, "");
    if (cep.length !== 8) {
      setCepErro("");
      setCepLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setCepLoading(true);
      setCepErro("");
      try {
        const res = await fetch(`${API_URL}/api/cardapio/cep/${cep}`, { signal: controller.signal });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || "CEP não encontrado.");
        if (payload.enderecoFormatado) {
          setForm((f) => ({ ...f, enderecoEntrega: payload.enderecoFormatado }));
        }
      } catch (error: any) {
        if (error?.name === "AbortError") return;
        setCepErro(error?.message || "Não foi possível buscar o CEP.");
      } finally {
        if (!controller.signal.aborted) setCepLoading(false);
      }
    }, 500);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [form.tipo, form.cepEntrega]);

  // Identificacao do cliente para a isencao de frete. So enviamos quando o dado
  // ja esta completo, senao o frete seria recalculado a cada tecla digitada.
  const telefoneParaFrete =
    form.telefoneCliente.replace(/\D/g, "").length >= 10 ? form.telefoneCliente.trim() : "";
  const emailParaFrete = /.+@.+\..+/.test(form.emailCliente.trim()) ? form.emailCliente.trim() : "";

  useEffect(() => {
    if (form.tipo !== "DELIVERY") {
      setFreteInfo(null);
      setFreteErro("");
      setFreteLoading(false);
      return;
    }

    const endereco = [form.enderecoEntrega.trim(), form.numeroEntrega.trim()].filter(Boolean).join(", ");
    const cep = (form.cepEntrega || "").replace(/\D/g, "");
    if (!form.enderecoEntrega.trim() || !form.numeroEntrega.trim() || cep.length !== 8) {
      // Precisamos do endereco, do numero E de um CEP valido (8 digitos) para calcular o frete.
      setFreteInfo(null);
      setFreteErro("");
      setFreteLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setFreteLoading(true);
      setFreteErro("");

      try {
        const res = await fetch(`${API_URL}/api/cardapio/frete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enderecoEntrega: endereco,
            cepEntrega: form.cepEntrega?.trim() || undefined,
            // Identificam o cliente para aplicar a isencao de frete do cadastro.
            telefoneCliente: telefoneParaFrete || undefined,
            emailCliente: emailParaFrete || undefined,
          }),
          signal: controller.signal,
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || "Nao foi possivel calcular o frete.");
        }

        const info = payload as FreteInfo;
        setFreteInfo(info);
        if (!info.atende) {
          setFreteErro(info.motivo || "Endereco fora da area de entrega.");
          if (info.acimaDoLimite) {
            setForaDeAreaModalOpen(true);
          }
        }
      } catch (error: any) {
        if (error?.name === "AbortError") return;
        setFreteInfo(null);
        setFreteErro(error?.message || "Nao foi possivel calcular o frete.");
      } finally {
        if (!controller.signal.aborted) {
          setFreteLoading(false);
        }
      }
    }, 700);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [form.tipo, form.enderecoEntrega, form.numeroEntrega, form.cepEntrega, telefoneParaFrete, emailParaFrete]);

  const obterEstoqueDisponivel = (produto: any, variacaoNome?: string) => {
    if (produto?.controlaEstoquePorVariacao && variacaoNome) {
      const variacao = (produto.variacoes || []).find((item: any) => item.nome === variacaoNome);
      return Number(variacao?.estoque || 0);
    }
    return Number(produto?.estoque || 0);
  };

  const qtdItemNoCarrinho = (itemKey: string) => carrinho.find((item) => item.itemKey === itemKey)?.quantidade || 0;

  const adicionarItem = (produto: any, variacaoNome?: string) => {
    if (produto.estoque === 0 || !produto.disponivel) return;

    const variacoes = Array.isArray(produto.variacoes) ? produto.variacoes : [];
    if (variacoes.length > 0 && !variacaoNome) {
      setProdutoSelecionandoVariacao(produto);
      setVariacaoSelecionada("");
      setVariacaoDialogOpen(true);
      return;
    }

    const itemKey = `${produto.id}::${variacaoNome || "sem-variacao"}`;
    const estoqueDisponivel = obterEstoqueDisponivel(produto, variacaoNome);
    if (qtdItemNoCarrinho(itemKey) >= estoqueDisponivel) {
      toast.error("Quantidade maxima desse sabor ja atingida.");
      return;
    }
    setCarrinho((prev) => {
      const existing = prev.find((i) => i.itemKey === itemKey);
      if (existing) {
        return prev.map((i) => (i.itemKey === itemKey ? { ...i, quantidade: i.quantidade + 1 } : i));
      }
      return [
        ...prev,
        {
          itemKey,
          produtoId: produto.id,
          nome: produto.nome,
          variacaoNome: variacaoNome || undefined,
          preco: produto.preco,
          quantidade: 1,
          imagemUrl: produto.imagemUrl,
        },
      ];
    });
    setPromptNovoItemOpen(true);
  };

  const confirmarVariacao = () => {
    if (!produtoSelecionandoVariacao || !variacaoSelecionada) return;
    adicionarItem(produtoSelecionandoVariacao, variacaoSelecionada);
    setVariacaoDialogOpen(false);
    setProdutoSelecionandoVariacao(null);
    setVariacaoSelecionada("");
  };

  const fecharDialogVariacao = () => {
    setVariacaoDialogOpen(false);
    setProdutoSelecionandoVariacao(null);
    setVariacaoSelecionada("");
  };

  const removerItem = (itemKey: string) => setCarrinho((prev) => prev.filter((i) => i.itemKey !== itemKey));
  const alterarQtd = (itemKey: string, qtd: number) => {
    if (qtd <= 0) {
      removerItem(itemKey);
      return;
    }
    const item = carrinho.find((entry) => entry.itemKey === itemKey);
    const produto = produtos.find((entry: any) => entry.id === item?.produtoId);
    if (item && produto && qtd > obterEstoqueDisponivel(produto, item.variacaoNome)) {
      toast.error("Quantidade acima do estoque disponivel.");
      return;
    }
    setCarrinho((prev) => prev.map((i) => (i.itemKey === itemKey ? { ...i, quantidade: qtd } : i)));
  };
  const qtdNoCarrinho = (produtoId: string) =>
    carrinho
      .filter((i) => i.produtoId === produtoId)
      .reduce((soma, item) => soma + item.quantidade, 0);

  const enviarPedido = useMutation({
    mutationFn: async (cartao?: CartaoTokenizado) => {
      const valorTrocoNumero = Number(valorTrocoPara.replace(",", "."));

      const res = await fetch(`${API_URL}/api/cardapio/pedido`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          // O numero da casa e salvo junto com o endereco.
          enderecoEntrega: [form.enderecoEntrega.trim(), form.numeroEntrega.trim()].filter(Boolean).join(", "),
          pagamento: formaPagamento,
          pagamentoEntregaMetodo: formaPagamento === "PAGAR_NA_ENTREGA" ? pagamentoEntrega : undefined,
          precisaTroco: pagamentoDinheiroEntrega ? precisaTrocoEntrega === true : undefined,
          valorTrocoPara:
            pagamentoDinheiroEntrega && precisaTrocoEntrega === true && Number.isFinite(valorTrocoNumero) && valorTrocoNumero > 0
              ? valorTrocoNumero
              : undefined,
          // Cartao online (Checkout Transparente): token gerado no navegador.
          cartaoToken: cartao?.token,
          cartaoTokenSalvar: cartao?.tokenSave,
          cartaoPaymentMethodId: cartao?.paymentMethodId,
          cartaoIssuerId: cartao?.issuerId,
          cartaoDocType: cartao?.identificationType,
          cartaoDocNumber: cartao?.identificationNumber,
          cartaoEmail: cartao?.email,
          cartaoSalvar: cartao?.salvar,
          cartaoSalvoId: cartao?.cartaoSalvoId,
          cupomCodigo: cupomAplicado?.codigo,
          itens: carrinho.map((i) => ({
            produtoId: i.produtoId,
            quantidade: i.quantidade,
            variacaoNome: i.variacaoNome,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao enviar pedido");
      }
      return res.json();
    },
    onSuccess: (pedido) => {
      setPedidoConfirmado(pedido);
      setEtapa("confirmado");
      removerCupom();
      // Salva o contato no navegador para o autofill e a tela "Meus pedidos".
      try {
        const contato = { telefone: form.telefoneCliente || "", email: form.emailCliente || "" };
        localStorage.setItem("barracao_cliente", JSON.stringify(contato));
        setBuscaContato(contato);
      } catch {
        /* ignore */
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Busca cartoes salvos do cliente quando escolhe cartao de credito (por email/telefone).
  useEffect(() => {
    if (formaPagamento !== "CARTAO_CREDITO") return;
    const tel = (form.telefoneCliente || "").replace(/\D/g, "");
    const email = (form.emailCliente || "").trim();
    if (tel.length < 10 && !/.+@.+\..+/.test(email)) {
      setCartoesSalvos([]);
      setCartaoModo("novo");
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const qs = new URLSearchParams();
        if (tel.length >= 10) qs.set("telefone", tel);
        if (/.+@.+\..+/.test(email)) qs.set("email", email);
        const res = await fetch(`${API_URL}/api/cardapio/cartoes?${qs.toString()}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const cards = Array.isArray(data?.cards) ? data.cards : [];
        setCartoesSalvos(cards);
        setCartaoModo(cards.length > 0 ? cards[0].id : "novo");
      } catch {
        /* ignore */
      }
    })();
    return () => controller.abort();
  }, [formaPagamento, form.telefoneCliente, form.emailCliente]);

  const pagarComCartaoSalvo = async () => {
    const card = cartoesSalvos.find((c) => c.id === cartaoModo);
    if (!card) return;
    if (!cvvSalvo || cvvSalvo.length < 3) {
      toast.error("Informe o CVV do cartão.");
      return;
    }
    setProcessandoSalvo(true);
    try {
      const token = await tokenizarCartaoSalvo(card.id, cvvSalvo);
      enviarPedido.mutate({
        token,
        paymentMethodId: card.paymentMethodId,
        issuerId: card.issuerId,
        installments: 1,
        cartaoSalvoId: card.id,
      });
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível validar o cartão salvo.");
    } finally {
      setProcessandoSalvo(false);
    }
  };

  const resetar = () => {
    setCarrinho([]);
    setCarrinhoOpen(false);
    setPedidoConfirmado(null);
    setEtapa("carrinho");
    setForm({ nomeCliente: "", telefoneCliente: "", emailCliente: "", cepEntrega: "", enderecoEntrega: "", numeroEntrega: "", tipo: "DELIVERY", observacoes: "" });
    setFormaPagamento("PIX");
    setPagamentoEntrega("DINHEIRO");
    setPrecisaTrocoEntrega(null);
    setValorTrocoPara("");
    setFreteInfo(null);
    setFreteLoading(false);
    setFreteErro("");
    setForaDeAreaModalOpen(false);
    setPixCopiado(false);
  };

  // Fora do raio de entrega: cliente vem retirar (no balcao ou enviando Uber Flash/99). Em ambos os casos o pedido vira RETIRADA.
  const escolherRetiradaNaLoja = () => {
    setForm((f) => ({ ...f, tipo: "RETIRADA" }));
    setFreteInfo(null);
    setFreteErro("");
    setForaDeAreaModalOpen(false);
  };

  const escolherUberFlash = () => {
    const aviso = "Cliente vai enviar Uber Flash/99 para retirar no balcao.";
    setForm((f) => ({
      ...f,
      tipo: "RETIRADA",
      observacoes: f.observacoes?.includes(aviso)
        ? f.observacoes
        : [f.observacoes?.trim(), aviso].filter(Boolean).join(" | "),
    }));
    setFreteInfo(null);
    setFreteErro("");
    setForaDeAreaModalOpen(false);
  };

  const pedidoExibido = pedidoAtual ?? pedidoConfirmado;
  const pixCode = pedidoExibido?.mercadoPago?.pix?.payload || "";
  const pixQrCodeImageUrl = pedidoExibido?.mercadoPago?.pix?.qrCodeImageUrl || "";
  const pagamentoConfirmado = pedidoExibido?.statusPagamento === "PAGO";
  const whatsappAtendimento = pedidoExibido?.whatsappAtendimento;
  const whatsappMensagemConfirmacao = pedidoExibido
    ? [
        "Ola! Fiz um pedido no cardapio e quero confirmar.",
        "PEDIDO_CARDAPIO_CONFIRMAR",
        `Pedido ID: ${pedidoExibido.id}`,
        `Pedido numero: #${pedidoExibido.numero}`,
        `Nome: ${pedidoExibido.nomeCliente || form.nomeCliente}`,
        `Telefone: ${pedidoExibido.telefoneCliente || form.telefoneCliente}`,
        `Total: ${fmt(Number(pedidoExibido.total || 0))}`,
        `Pagamento: ${formaPagamento === "PIX" ? "PIX" : "OUTRO"}`,
      ].join("\n")
    : "";
  const whatsappConfirmacaoUrl =
    whatsappAtendimento?.url && whatsappMensagemConfirmacao
      ? `${whatsappAtendimento.url}?text=${encodeURIComponent(whatsappMensagemConfirmacao)}`
      : "";
  const valorTrocoNumero = Number(valorTrocoPara.replace(",", "."));
  const trocoInvalido =
    pagamentoDinheiroEntrega && precisaTrocoEntrega === true && (!Number.isFinite(valorTrocoNumero) || valorTrocoNumero <= 0);
  const faltouEscolherTroco = pagamentoDinheiroEntrega && precisaTrocoEntrega === null;
  const cepValido = (form.cepEntrega || "").replace(/\D/g, "").length === 8;
  const fretePendente =
    form.tipo === "DELIVERY" &&
    Boolean(form.enderecoEntrega.trim()) &&
    cepValido &&
    (freteLoading || (!freteInfo && !freteErro));
  const freteInvalido =
    form.tipo === "DELIVERY" && Boolean(form.enderecoEntrega.trim()) && cepValido && (!freteLoading && (!!freteErro || !freteInfo?.atende));
  // E-mail so e obrigatorio de verdade quando o Mercado Pago precisa dele (PIX ou cartao online).
  // Pagamento em dinheiro/na entrega nao passa pelo Mercado Pago, entao nao precisa de e-mail.
  const emailObrigatorio = formaPagamento === "PIX" || formaPagamento === "CARTAO_CREDITO";
  const podeIrPagamento =
    !lojaFechada &&
    !!form.nomeCliente &&
    !!form.telefoneCliente &&
    (form.tipo !== "DELIVERY" || (Boolean(form.enderecoEntrega.trim()) && Boolean(form.numeroEntrega.trim()) && cepValido && !fretePendente && !freteInvalido));
  const podeConfirmarPedido =
    !enviarPedido.isPending && !faltouEscolherTroco && !trocoInvalido && !fretePendente && !freteInvalido && !lojaFechada &&
    (!emailObrigatorio || !!form.emailCliente.trim());

  const getImageTone = (imagemUrl?: string) => {
    const resolved = resolveImageUrl(imagemUrl);
    if (!resolved) return "dark";
    return imageToneByUrl[resolved] || "dark";
  };

  // Paleta do cardapio digital: vermelho da marca sobre marrom escuro, texto branco.
  const cardapioThemeVars: CSSProperties = {
    ["--background" as any]: "12 30% 6%",
    ["--foreground" as any]: "30 30% 97%",
    ["--primary" as any]: "358 78% 52%",
    ["--primary-foreground" as any]: "0 0% 100%",
    ["--accent" as any]: "16 32% 16%",
    ["--accent-foreground" as any]: "30 30% 97%",
    ["--muted-foreground" as any]: "22 22% 72%",
    ["--border" as any]: "16 26% 22%",
    ["--input" as any]: "16 26% 22%",
    ["--ring" as any]: "358 78% 52%",
  };

  return (
    <div className="cardapio-dark min-h-screen bg-marrom-950 text-white" style={cardapioThemeVars}>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-marrom-950/95 text-white shadow-sm backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Barracão Gourmet" className="h-10 w-10 object-contain" />
            <div>
              <p className="font-bold leading-tight text-white">Barracão Gourmet</p>
              <p className="text-xs text-marrom-300">Cardápio Digital</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
          <button
            onClick={() => setMeusPedidosOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
          >
            <ClipboardList className="h-5 w-5" />
            <span className="hidden sm:inline">Meus pedidos</span>
          </button>
          <Sheet open={carrinhoOpen} onOpenChange={setCarrinhoOpen}>
            <button
              onClick={() => setCarrinhoOpen(true)}
              className="relative flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              <ShoppingCart className="h-5 w-5" />
              {qtdCarrinho > 0 ? <span className="font-bold">{fmt(totalCarrinho)}</span> : <span>Carrinho</span>}
              {qtdCarrinho > 0 && (
                <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
                  {qtdCarrinho}
                </span>
              )}
            </button>

            <SheetContent
              className="w-full sm:max-w-lg overflow-y-auto border-marrom-800 bg-marrom-950 p-0 text-white"
              style={cardapioThemeVars}
            >
              <div className="sticky top-0 z-10 border-b border-marrom-800 bg-marrom-950 px-6 py-4">
                <SheetHeader><SheetTitle className="text-white">Seu Pedido</SheetTitle></SheetHeader>
              </div>

              <div className="px-6 py-4">
                {etapa === "carrinho" && (
                  <div className="space-y-4">
                    {carrinho.length === 0 ? (
                      <div className="flex h-40 flex-col items-center justify-center text-marrom-300">
                        <ShoppingCart className="h-10 w-10 mb-2" />
                        <p>Carrinho vazio</p>
                        <p className="text-sm">Adicione produtos para continuar</p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-3">
                          {carrinho.map((item) => (
                            <div key={item.itemKey} className="flex items-center gap-3 border-b border-marrom-800 py-2">
                              {item.imagemUrl && (
                                <img src={resolveImageUrl(item.imagemUrl) ?? undefined} alt={item.nome} className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{item.nome}</p>
                                {item.variacaoNome && <p className="text-xs text-marrom-300">Sabor: {item.variacaoNome}</p>}
                                <p className="text-xs text-marrom-300">{fmt(item.preco)} cada</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <button className="flex h-7 w-7 items-center justify-center rounded border border-marrom-700 hover:bg-marrom-800" onClick={() => alterarQtd(item.itemKey, item.quantidade - 1)}><Minus className="h-3 w-3" /></button>
                                <span className="w-6 text-center text-sm font-bold">{item.quantidade}</span>
                                <button className="flex h-7 w-7 items-center justify-center rounded border border-marrom-700 hover:bg-marrom-800" onClick={() => alterarQtd(item.itemKey, item.quantidade + 1)}><Plus className="h-3 w-3" /></button>
                              </div>
                              <span className="text-sm font-bold w-16 text-right">{fmt(item.preco * item.quantidade)}</span>
                              <button className="text-destructive hover:text-destructive/80" onClick={() => removerItem(item.itemKey)}><Trash2 className="h-4 w-4" /></button>
                            </div>
                          ))}
                          <div className="flex justify-between font-bold text-lg pt-2 text-white">
                            <span>Total</span>
                            <span className="text-white">{fmt(totalCarrinho)}</span>
                          </div>
                        </div>
                        <Button className={`w-full ${accentButtonClass}`} size="lg" onClick={() => setEtapa("dados")}>
                          Continuar → Dados de entrega
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {etapa === "dados" && (
                  <div className="space-y-4">
                    <button className="text-sm text-marrom-300 hover:text-white" onClick={() => setEtapa("carrinho")}>← Voltar ao carrinho</button>
                    <h3 className="font-semibold text-white">Seus dados</h3>
                    <div className="space-y-3">
                      <div className="space-y-1"><Label className="text-white">Nome *</Label><Input className={darkInputClass} value={form.nomeCliente} onChange={(e) => setForm((f) => ({ ...f, nomeCliente: e.target.value }))} placeholder="Seu nome completo" /></div>
                      <div className="space-y-1"><Label className="text-white">Telefone *</Label><Input className={darkInputClass} value={form.telefoneCliente} onChange={(e) => setForm((f) => ({ ...f, telefoneCliente: e.target.value }))} placeholder="(11) 99999-9999" /></div>
                      <div className="space-y-1">
                        <Label className="text-white">E-mail{emailObrigatorio ? " *" : ""}</Label>
                        <Input
                          className={darkInputClass}
                          type="email"
                          value={form.emailCliente}
                          onChange={(e) => setForm((f) => ({ ...f, emailCliente: e.target.value.replace(/\s+/g, "") }))}
                          onBlur={(e) => {
                            const corrigido = corrigirTypoEmail(e.target.value);
                            if (corrigido !== e.target.value) setForm((f) => ({ ...f, emailCliente: corrigido }));
                          }}
                          placeholder="voce@email.com"
                        />
                        {!emailObrigatorio && <p className="text-xs text-marrom-300">Opcional para pagamento em dinheiro ou na entrega. Necessário para PIX ou cartão online.</p>}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-white">CEP {form.tipo === "DELIVERY" ? "*" : ""}</Label>
                        <Input className={darkInputClass} value={form.cepEntrega} onChange={(e) => setForm((f) => ({ ...f, cepEntrega: e.target.value }))} placeholder="00000-000" />
                        {form.tipo === "DELIVERY" && cepLoading && <p className="text-xs text-marrom-200">Buscando endereço pelo CEP...</p>}
                        {form.tipo === "DELIVERY" && cepErro && <p className="text-xs text-rose-400">{cepErro}</p>}
                        {form.tipo === "DELIVERY" && !cepLoading && !cepErro && <p className="text-xs text-marrom-300">Digite o CEP que preenchemos o endereço automaticamente.</p>}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-white">Tipo de pedido</Label>
                        <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                          <SelectTrigger className={darkSelectClass}><SelectValue /></SelectTrigger>
                          <SelectContent className="border-marrom-700 bg-marrom-900 text-white">
                            <SelectItem value="DELIVERY">Delivery</SelectItem>
                            <SelectItem value="RETIRADA">Retirada na loja</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {form.tipo === "DELIVERY" && (
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <Label className="text-white">Endereço de entrega *</Label>
                            <Input className={darkInputClass} value={form.enderecoEntrega} onChange={(e) => setForm((f) => ({ ...f, enderecoEntrega: e.target.value }))} placeholder="Rua e bairro" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-white">Número *</Label>
                            <Input className={darkInputClass} value={form.numeroEntrega} onChange={(e) => setForm((f) => ({ ...f, numeroEntrega: e.target.value }))} placeholder="Ex: 123" />
                          </div>
                          <div className="rounded-lg border border-marrom-800 bg-marrom-900/80 px-3 py-2">
                            {(!form.enderecoEntrega.trim() || !form.numeroEntrega.trim()) && (
                              <p className="text-xs text-marrom-300">Informe o endereço, o número e o CEP para calcular o frete automaticamente.</p>
                            )}
                            {form.enderecoEntrega.trim() && !cepValido && (
                              <p className="text-xs text-amber-400">Informe o CEP (8 dígitos) para calcular o frete.</p>
                            )}
                            {freteLoading && (
                              <p className="text-xs text-marrom-200">Calculando frete...</p>
                            )}
                            {!freteLoading && freteInfo?.atende && (
                              <div className="space-y-1">
                                <p className="text-xs text-marrom-100">
                                  Distância estimada: <span className="font-semibold">{Number(freteInfo.distanciaKm || 0).toFixed(2)} km</span>
                                </p>
                                <p className="text-xs text-marrom-100">
                                  Frete:{" "}
                                  {freteInfo.entregaGratis ? (
                                    <span className="font-semibold text-emerald-400">GRÁTIS</span>
                                  ) : (
                                    <span className="font-semibold text-white">{fmt(Number(freteInfo.frete || 0))}</span>
                                  )}
                                </p>
                                {freteInfo.entregaGratis && (
                                  <p className="text-xs text-emerald-300">Entrega grátis liberada para o seu cadastro. 🎉</p>
                                )}
                              </div>
                            )}
                            {!freteLoading && freteErro && (
                              <p className="text-xs text-rose-400">{freteErro}</p>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="space-y-1"><Label className="text-white">Observações</Label><Textarea className={darkInputClass} value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} placeholder="Alguma observação?" rows={2} /></div>
                    </div>
                    <Button
                      className={`w-full ${accentButtonClass}`}
                      size="lg"
                      disabled={!podeIrPagamento}
                      onClick={() => setEtapa("pagamento")}
                    >
                      Continuar → Pagamento
                    </Button>
                    {(fretePendente || freteInvalido) && form.tipo === "DELIVERY" && (
                      <p className="text-xs text-amber-400">
                        {fretePendente
                          ? "Aguardando cálculo do frete para continuar."
                          : "Revise o endereço informado para continuar."}
                      </p>
                    )}
                  </div>
                )}

                {etapa === "pagamento" && (
                  <div className="space-y-4">
                    <button className="text-sm text-marrom-300 hover:text-white" onClick={() => setEtapa("dados")}>← Voltar</button>
                    <h3 className="font-semibold">Forma de pagamento</h3>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: "PIX", label: "PIX", icon: QrCode },
                        { value: "CARTAO_CREDITO", label: "Cartão de crédito", icon: CreditCard },
                      ].map((m) => (
                        <button
                          key={m.value}
                          onClick={() => setFormaPagamento(m.value as FormaPagamento)}
                          className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-colors ${formaPagamento === m.value ? "border-primary bg-primary/10" : "border-marrom-700 hover:border-primary/50"}`}
                        >
                          <m.icon className={`h-5 w-5 ${formaPagamento === m.value ? "text-primary" : "text-marrom-300"}`} />
                          <span className={`text-center text-xs font-medium ${formaPagamento === m.value ? "text-primary" : "text-marrom-300"}`}>{m.label}</span>
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setFormaPagamento("PAGAR_NA_ENTREGA")}
                      className={`w-full rounded-xl border-2 p-4 text-left transition-colors ${formaPagamento === "PAGAR_NA_ENTREGA" ? "border-primary bg-primary/10" : "border-marrom-700 hover:border-primary/50"}`}
                    >
                      <div className="flex items-center gap-2">
                        <Truck className={`h-4 w-4 ${formaPagamento === "PAGAR_NA_ENTREGA" ? "text-primary" : "text-marrom-300"}`} />
                        <span className={`font-medium ${formaPagamento === "PAGAR_NA_ENTREGA" ? "text-primary" : ""}`}>Pagar na entrega</span>
                      </div>
                      <p className="text-xs text-marrom-300 mt-1">Escolha cartão ou dinheiro para o pagamento na entrega.</p>
                    </button>

                    {formaPagamento === "PAGAR_NA_ENTREGA" && (
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" variant={pagamentoEntrega === "CARTAO_CREDITO" ? "default" : "outline"} onClick={() => setPagamentoEntrega("CARTAO_CREDITO")}>
                          Cartão
                        </Button>
                        <Button type="button" variant={pagamentoEntrega === "DINHEIRO" ? "default" : "outline"} onClick={() => setPagamentoEntrega("DINHEIRO")}>
                          Dinheiro
                        </Button>
                      </div>
                    )}

                    {pagamentoDinheiroEntrega && (
                      <div className="space-y-3 rounded-xl border border-marrom-800 bg-marrom-900/80 p-4">
                        <p className="text-sm font-medium">Precisa de troco?</p>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant={precisaTrocoEntrega === false ? "default" : "outline"}
                            onClick={() => setPrecisaTrocoEntrega(false)}
                          >
                            Não
                          </Button>
                          <Button
                            type="button"
                            variant={precisaTrocoEntrega === true ? "default" : "outline"}
                            onClick={() => setPrecisaTrocoEntrega(true)}
                          >
                            Sim
                          </Button>
                        </div>

                        {precisaTrocoEntrega === true && (
                          <div className="space-y-1">
                            <Label>Troco para qual valor?</Label>
                            <Input
                              className={darkInputClass}
                              type="number"
                              min="0"
                              step="0.01"
                              inputMode="decimal"
                              placeholder="Ex: 100"
                              value={valorTrocoPara}
                              onChange={(e) => setValorTrocoPara(e.target.value)}
                            />
                            <p className="text-xs text-marrom-300">Informe o valor da nota que será usada no pagamento.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {formaPagamento === "PIX" && (
                      <div className="space-y-3 rounded-xl bg-marrom-900 p-4">
                        <div className="flex items-center gap-2 font-semibold">
                          <QrCode className="h-5 w-5 text-primary" />
                          PIX na hora
                        </div>
                        <p className="text-xs text-marrom-300">Após confirmar o pedido, o código PIX será exibido.</p>
                      </div>
                    )}
                    {formaPagamento === "CARTAO_CREDITO" && (
                      <div className="rounded-xl bg-marrom-900 p-2">
                        <div className="mb-2 flex items-center gap-2 px-2 pt-2 font-semibold">
                          <CreditCard className="h-5 w-5 text-primary" />
                          Cartão de crédito · à vista
                        </div>
                        <p className="mb-3 px-2 text-xs text-marrom-300">Pagamento online e seguro, processado pelo Mercado Pago.</p>
                      </div>
                    )}

                    <div className="space-y-2 rounded-xl border border-marrom-800 bg-marrom-900/80 p-3">
                      <Label className="text-white text-sm">Cupom de desconto</Label>
                      {cupomAplicado ? (
                        <div className="flex items-center justify-between rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-3 py-2">
                          <div>
                            <p className="text-sm font-semibold text-emerald-400">{cupomAplicado.codigo}</p>
                            <p className="text-xs text-marrom-300">
                              {cupomAplicado.tipo === "PERCENTUAL" ? `${cupomAplicado.valor}% off` : `${fmt(cupomAplicado.valor)} off`} · desconto de {fmt(descontoCupom)}
                            </p>
                          </div>
                          <Button type="button" variant="ghost" size="sm" className="text-marrom-200 hover:text-white" onClick={removerCupom}>
                            Remover
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Input
                            className={`${darkInputClass} font-mono`}
                            value={cupomInput}
                            onChange={(e) => setCupomInput(e.target.value.toUpperCase())}
                            placeholder="Digite o código do cupom"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className={darkOutlineButtonClass}
                            disabled={!cupomInput.trim() || cupomValidando}
                            onClick={() => aplicarCupom()}
                          >
                            {cupomValidando ? "..." : "Aplicar"}
                          </Button>
                        </div>
                      )}
                      {cupomErro && !cupomAplicado && <p className="text-xs text-rose-400">{cupomErro}</p>}
                    </div>

                    <div className="space-y-2 rounded-xl bg-marrom-900 p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-marrom-200">Subtotal</span>
                        <span>{fmt(totalCarrinho)}</span>
                      </div>
                      {pagamentoUsaCartao(formaPagamento, pagamentoEntrega) && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-marrom-200">Adicional no cartao</span>
                          <span>{fmt(adicionalCartao)}</span>
                        </div>
                      )}
                      {cupomAplicado && (
                        <div className="flex items-center justify-between text-sm text-emerald-400">
                          <span>Desconto ({cupomAplicado.codigo})</span>
                          <span>-{fmt(descontoCupom)}</span>
                        </div>
                      )}
                      {form.tipo === "DELIVERY" && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-marrom-200">Frete</span>
                          <span>
                            {freteLoading
                              ? "Calculando..."
                              : freteInfo?.entregaGratis
                                ? <span className="font-semibold text-emerald-400">GRÁTIS</span>
                                : fmt(freteAtual)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between border-t border-marrom-800 pt-2">
                        <span className="text-sm font-medium">Total a pagar</span>
                        <span className="text-lg font-bold text-primary">{fmt(totalComFrete)}</span>
                      </div>
                    </div>

                    {formaPagamento !== "CARTAO_CREDITO" ? (
                      <Button
                        className="w-full"
                        size="lg"
                        disabled={!podeConfirmarPedido}
                        onClick={() => enviarPedido.mutate(undefined)}
                      >
                        {enviarPedido.isPending ? "Processando..." : `Confirmar pedido · ${fmt(totalComFrete)}`}
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        {cartoesSalvos.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs text-marrom-300">Seus cartões salvos</p>
                            {cartoesSalvos.map((card) => (
                              <button
                                key={card.id}
                                type="button"
                                onClick={() => setCartaoModo(card.id)}
                                className={`flex w-full items-center justify-between rounded-lg border p-3 text-sm transition-colors ${cartaoModo === card.id ? "border-primary bg-primary/10" : "border-marrom-700 hover:border-primary/50"}`}
                              >
                                <span className="flex items-center gap-2">
                                  <CreditCard className="h-4 w-4" /> •••• {card.lastFour}
                                </span>
                                <span className="text-xs uppercase text-marrom-300">{card.brand}</span>
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setCartaoModo("novo")}
                              className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${cartaoModo === "novo" ? "border-primary bg-primary/10" : "border-marrom-700 hover:border-primary/50"}`}
                            >
                              + Usar outro cartão
                            </button>
                          </div>
                        )}

                        {cartaoModo !== "novo" ? (
                          <div className="space-y-2">
                            <Label className="text-white">
                              CVV do cartão •••• {cartoesSalvos.find((c) => c.id === cartaoModo)?.lastFour}
                            </Label>
                            <Input
                              className={darkInputClass}
                              value={cvvSalvo}
                              onChange={(e) => setCvvSalvo(e.target.value.replace(/\D/g, ""))}
                              placeholder="CVV"
                              inputMode="numeric"
                              maxLength={4}
                            />
                            <Button
                              className="w-full"
                              size="lg"
                              disabled={!podeConfirmarPedido || processandoSalvo || enviarPedido.isPending}
                              onClick={pagarComCartaoSalvo}
                            >
                              {processandoSalvo || enviarPedido.isPending ? "Processando..." : `Pagar ${fmt(totalComFrete)}`}
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <CardFormMercadoPago
                              amount={totalComFrete}
                              emailInicial={form.emailCliente}
                              disabled={!podeConfirmarPedido}
                              processando={enviarPedido.isPending}
                              salvar={salvarCartao}
                              onToken={(cartao) => enviarPedido.mutate(cartao)}
                              onEmailChange={(email) => setForm((f) => ({ ...f, emailCliente: email }))}
                            />
                            <label className="flex items-center gap-2 text-xs text-marrom-200">
                              <input type="checkbox" checked={salvarCartao} onChange={(e) => setSalvarCartao(e.target.checked)} />
                              Salvar cartão para as próximas compras
                            </label>
                          </div>
                        )}
                      </div>
                    )}
                    {(faltouEscolherTroco || trocoInvalido || fretePendente || freteInvalido || (emailObrigatorio && !form.emailCliente.trim())) && (
                      <p className="text-xs text-amber-400">
                        {fretePendente
                          ? "Aguardando cálculo do frete."
                          : freteInvalido
                            ? "Não foi possível validar o frete para este endereço."
                            : faltouEscolherTroco
                          ? "Confirme se precisa de troco para continuar."
                          : trocoInvalido
                          ? "Informe um valor válido da nota para troco."
                          : "Informe um e-mail para pagar com PIX ou cartão online."}
                      </p>
                    )}
                  </div>
                )}

                {etapa === "confirmado" && pedidoConfirmado && (
                  <div className="space-y-4">
                    <div className="flex flex-col items-center text-center py-4">
                      <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                        <CheckCircle className="h-8 w-8 text-emerald-600" />
                      </div>
                      <h3 className="text-xl font-bold">Pedido #{pedidoConfirmado.numero} confirmado!</h3>
                      <p className="text-marrom-300 text-sm mt-1">Seu pedido foi recebido com sucesso.</p>
                    </div>

                    {pedidoExibido?.mercadoPago?.pix?.expirationDate && (
                      <p className="rounded-xl border border-marrom-800 bg-marrom-900/80 px-4 py-3 text-center text-xs text-marrom-300">
                        Expiração do PIX: {new Date(pedidoExibido.mercadoPago.pix.expirationDate).toLocaleString("pt-BR")}
                      </p>
                    )}

                    <div className="space-y-2 rounded-xl border border-marrom-800 bg-marrom-900/80 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Status atual</span>
                        <Badge variant="outline">{STATUS_LABEL[pedidoExibido?.status] ?? pedidoExibido?.status ?? "RECEBIDO"}</Badge>
                      </div>
                      <p className="text-xs text-marrom-300">Atualizamos o status automaticamente a cada 10 segundos.</p>
                      {pedidoExibido?.statusPagamento && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Pagamento</span>
                          <Badge variant="outline">{pedidoExibido.statusPagamento}</Badge>
                        </div>
                      )}
                    </div>

                    {formaPagamento === "PIX" && !pagamentoConfirmado && (
                      <div className="space-y-3 rounded-xl bg-marrom-900 p-4">
                        <div className="flex items-center gap-2 font-semibold">
                          <QrCode className="h-5 w-5 text-primary" />
                          Pague via PIX
                        </div>
                        {pedidoExibido?.mercadoPago?.order_id && (
                          <p className="text-xs text-marrom-500">Mercado Pago order_id: {pedidoExibido.mercadoPago.order_id}</p>
                        )}
                        {pixQrCodeImageUrl && (
                          <div className="overflow-hidden rounded-xl border border-marrom-800 bg-white p-3">
                            <img
                              src={resolveImageUrl(pixQrCodeImageUrl) ?? pixQrCodeImageUrl}
                              alt="QR Code PIX"
                              className="mx-auto h-56 w-56 rounded-lg object-contain"
                            />
                          </div>
                        )}
                        <p className="text-sm text-marrom-300">Copie o código abaixo e pague no seu banco:</p>
                        <div className="break-all rounded-lg border border-marrom-700 bg-marrom-950 p-3 font-mono text-xs">
                          {pixCode || "Nao foi possivel carregar o codigo PIX deste pedido."}
                        </div>
                        <Button
                          variant="outline"
                          className="w-full"
                          disabled={!pixCode}
                          onClick={() => {
                            navigator.clipboard.writeText(pixCode);
                            setPixCopiado(true);
                            toast.success("Código PIX copiado!");
                          }}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          {pixCopiado ? "Copiado!" : "Copiar código PIX"}
                        </Button>
                        <div className="flex items-center gap-2 text-xs text-marrom-300">
                          <Clock className="h-3 w-3" />
                          Apos o pagamento, aguarde a confirmacao do status.
                        </div>
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-50">
                          <p className="font-medium">Ultimo passo obrigatorio</p>
                          <p className="mt-1 text-emerald-100/90">
                            Copie o codigo, pague no banco e depois envie este pedido no WhatsApp para confirmar o atendimento.
                          </p>
                          {whatsappConfirmacaoUrl ? (
                            <Button
                              className="mt-3 w-full bg-emerald-500 text-marrom-950 hover:bg-emerald-400"
                              onClick={() => window.open(whatsappConfirmacaoUrl, "_blank")}
                            >
                              <MessageCircle className="mr-2 h-4 w-4" />
                              Enviar pedido no WhatsApp
                            </Button>
                          ) : (
                            <p className="mt-3 text-xs text-amber-300">
                              Nao encontrei o numero do WhatsApp de atendimento conectado no sistema.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {(pagamentoConfirmado || formaPagamento !== "PIX") && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                        <CheckCircle className="h-6 w-6 text-emerald-600 mx-auto mb-1" />
                        <p className="text-sm font-medium text-emerald-700">
                          {formaPagamento === "PIX"
                            ? "Pagamento PIX confirmado!"
                            : formaPagamento === "PAGAR_NA_ENTREGA"
                              ? `Pagamento na entrega via ${pagamentoEntrega === "CARTAO_CREDITO" ? "cartão" : "dinheiro"}${
                                  pagamentoEntrega === "DINHEIRO"
                                    ? precisaTrocoEntrega === true
                                      ? valorTrocoPara
                                        ? ` · Troco para R$ ${Number(valorTrocoPara.replace(",", ".")).toFixed(2)}`
                                        : " · Com troco"
                                      : " · Sem troco"
                                    : ""
                                }`
                              : `Pagamento via ${PAGAMENTO_LABEL[formaPagamento]} registrado`}
                        </p>
                      </div>
                    )}

                    <div className="space-y-2 rounded-xl border border-marrom-800 bg-marrom-900/80 p-4">
                      <p className="font-medium text-sm">Resumo do pedido:</p>
                      {pedidoConfirmado.itens?.map((item: any) => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <div>
                            <p>{item.quantidade}x {item.produto?.nome}</p>
                            {item.variacaoNome && <p className="text-xs text-marrom-300">Sabor: {item.variacaoNome}</p>}
                          </div>
                          <span>{fmt(item.subtotal)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold border-t pt-2">
                        <span>Total</span>
                        <span>{fmt(pedidoConfirmado.total)}</span>
                      </div>
                    </div>

                    <Button variant="outline" className="w-full" onClick={resetar}>
                      Fazer novo pedido
                    </Button>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
          </div>
        </div>
      </header>

      {lojaFechada && (
        <div className="border-b border-red-500/30 bg-red-950/60 px-4 py-2 text-center text-sm font-medium text-red-200">
          {mensagemLojaFechada}
        </div>
      )}

      <MeusPedidosSheet
        open={meusPedidosOpen}
        onOpenChange={setMeusPedidosOpen}
        contatoInicial={buscaContato}
        themeVars={cardapioThemeVars}
      />

      {categoriaAtiva && (
        <div className="sticky top-16 z-30 border-b border-white/10 bg-marrom-950/90 shadow-sm backdrop-blur">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setCategoriaAtiva(null)}
              className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4" />
              Categorias
            </button>
            <h2 className="text-base font-semibold text-white">{categoriaAtiva}</h2>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-6 pb-24">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-marrom-300 animate-pulse">Carregando cardápio...</p>
          </div>
        ) : !categoriaAtiva ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {categoriasComImagem.map((cat) => (
              <button
                key={cat.nome}
                onClick={() => setCategoriaAtiva(cat.nome)}
                className="group flex flex-col items-center gap-2 focus:outline-none"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-marrom-900 shadow-sm transition-transform group-hover:scale-[1.02] group-hover:shadow-lg group-hover:shadow-black/40">
                  {cat.imagemUrl ? (
                    <img
                      src={resolveImageUrl(cat.imagemUrl) ?? undefined}
                      alt={cat.nome}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-marrom-800 to-marrom-900">
                      <Wine className="h-10 w-10 text-marrom-500/60" />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-marrom-950/55 via-transparent to-transparent" />
                </div>
                <span className="text-center text-sm font-semibold leading-tight text-white">{cat.nome}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {produtosFiltrados.map((produto: any) => {
              const esgotado = produto.estoque === 0 || !produto.disponivel;
              const qtd = qtdNoCarrinho(produto.id);
              const temVariacoes = Array.isArray(produto.variacoes) && produto.variacoes.length > 0;
              const itemSemVariacaoKey = `${produto.id}::sem-variacao`;
              const qtdSemVariacao = carrinho.find((item) => item.itemKey === itemSemVariacaoKey)?.quantidade || 0;
              return (
                <Card key={produto.id} className={`overflow-hidden border-white/10 bg-marrom-900/80 text-white transition-shadow ${esgotado ? "opacity-70" : "hover:shadow-md hover:shadow-black/40"}`}>
                  {produto.imagemUrl ? (
                    <div className="relative h-44 overflow-hidden bg-marrom-950">
                      <img
                        src={resolveImageUrl(produto.imagemUrl) ?? undefined}
                        alt={produto.nome}
                        className="w-full h-full object-contain cursor-zoom-in"
                        onClick={() => setFotoAmpliada({ url: resolveImageUrl(produto.imagemUrl) ?? "", nome: produto.nome })}
                      />
                      <div
                        className={`pointer-events-none absolute inset-0 ${
                          getImageTone(produto.imagemUrl) === "light"
                            ? "bg-gradient-to-t from-marrom-950/75 via-marrom-950/25 to-transparent"
                            : "bg-gradient-to-t from-marrom-950/45 via-marrom-950/15 to-transparent"
                        }`}
                      />
                      {esgotado && (
                        <div className="absolute inset-0 bg-marrom-950/50 flex items-center justify-center">
                          <Badge className="bg-red-600 text-white text-sm px-3 py-1">Esgotado</Badge>
                        </div>
                      )}
                      <Badge className="absolute left-2 top-2 border border-white/20 bg-marrom-950/55 text-xs text-white">{produto.categoria}</Badge>
                    </div>
                  ) : (
                    <div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-marrom-900 to-marrom-800">
                      <Wine className="h-10 w-10 text-marrom-500/50" />
                      {esgotado && (
                        <div className="absolute inset-0 bg-marrom-950/40 flex items-center justify-center">
                          <Badge className="bg-red-600 text-white text-sm px-3 py-1">Esgotado</Badge>
                        </div>
                      )}
                      <Badge className="absolute left-2 top-2 border border-white/20 bg-marrom-950/55 text-xs text-white">{produto.categoria}</Badge>
                    </div>
                  )}

                  <CardContent className="p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-sm leading-tight">{produto.nome}</h3>
                      {produto.descricao && <p className="text-xs text-marrom-300 mt-1 line-clamp-2">{produto.descricao}</p>}
                      {Array.isArray(produto.variacoes) && produto.variacoes.length > 0 && (
                        <p className="text-xs text-marrom-300 mt-1 line-clamp-2">
                          {produto.tipoVariacao || "Variacoes"}: {produto.variacoes.map((variacao: any) => variacao.nome).join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-primary text-base">{fmt(produto.preco)}</span>
                      {esgotado ? (
                        <Badge variant="outline" className="border-marrom-600 text-xs text-marrom-300">Indisponível</Badge>
                      ) : temVariacoes ? (
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => adicionarItem(produto)} disabled={lojaFechada}>
                            <Plus className="h-4 w-4 mr-1" />
                            Escolher sabor
                          </Button>
                          {qtd > 0 && (
                            <Badge variant="outline" className="border-marrom-700 text-xs text-marrom-200">
                              {qtd} no carrinho
                            </Badge>
                          )}
                        </div>
                      ) : qtdSemVariacao === 0 ? (
                        <Button size="sm" onClick={() => adicionarItem(produto)} disabled={lojaFechada}>
                          <Plus className="h-4 w-4 mr-1" />
                          Adicionar
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button className="flex h-8 w-8 items-center justify-center rounded-full border border-marrom-700 hover:bg-marrom-800" onClick={() => alterarQtd(itemSemVariacaoKey, qtdSemVariacao - 1)}><Minus className="h-3 w-3" /></button>
                          <span className="w-6 text-center font-bold text-sm">{qtdSemVariacao}</span>
                          <button className="flex h-8 w-8 items-center justify-center rounded-full border border-marrom-700 hover:bg-marrom-800 disabled:opacity-40 disabled:pointer-events-none" onClick={() => alterarQtd(itemSemVariacaoKey, qtdSemVariacao + 1)} disabled={lojaFechada}><Plus className="h-3 w-3" /></button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {qtdCarrinho > 0 && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center px-4 z-50 sm:hidden">
          <Button size="lg" className="w-full max-w-sm border-marrom-800 bg-marrom-950 text-white shadow-xl" onClick={() => setCarrinhoOpen(true)}>
            <ShoppingCart className="h-5 w-5 mr-2" />
            Ver carrinho ({qtdCarrinho}) · {fmt(totalCarrinho)}
          </Button>
        </div>
      )}

      <Dialog open={!!fotoAmpliada} onOpenChange={(open) => { if (!open) setFotoAmpliada(null); }}>
        <DialogContent className="max-w-2xl border-marrom-800 bg-marrom-950 text-white">
          <DialogHeader>
            <DialogTitle className="text-base">{fotoAmpliada?.nome}</DialogTitle>
          </DialogHeader>
          {fotoAmpliada?.url && (
            <img
              src={fotoAmpliada.url}
              alt={fotoAmpliada.nome}
              className="mx-auto max-h-[75vh] w-auto max-w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={variacaoDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            fecharDialogVariacao();
            return;
          }
          setVariacaoDialogOpen(true);
        }}
      >
        <DialogContent className="max-w-sm border-marrom-800 bg-marrom-950 text-white">
          <DialogHeader>
            <DialogTitle>Escolha o sabor</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-marrom-300">{produtoSelecionandoVariacao?.nome}</p>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {(produtoSelecionandoVariacao?.variacoes || []).map((variacao: any) => {
              const selecionada = variacaoSelecionada === variacao.nome;
              return (
                <button
                  key={variacao.id || variacao.nome}
                  type="button"
                  onClick={() => setVariacaoSelecionada(variacao.nome)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                    selecionada
                      ? "border-primary bg-primary/10 text-white"
                      : "border-marrom-700 bg-marrom-900 text-marrom-200 hover:border-marrom-500"
                  }`}
                >
                  <p className="text-sm font-medium">{variacao.nome}</p>
                  {variacao.descricao && <p className="text-xs text-marrom-300">{variacao.descricao}</p>}
                  {produtoSelecionandoVariacao?.controlaEstoquePorVariacao && (
                    <p className="text-xs text-marrom-500">Estoque: {variacao.estoque ?? 0}</p>
                  )}
                </button>
              );
            })}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className={darkOutlineButtonClass} onClick={fecharDialogVariacao}>
              Cancelar
            </Button>
            <Button className={accentButtonClass} disabled={!variacaoSelecionada || lojaFechada} onClick={confirmarVariacao}>
              Adicionar ao carrinho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={promptNovoItemOpen} onOpenChange={setPromptNovoItemOpen}>
        <DialogContent className="max-w-sm border-marrom-800 bg-marrom-950 text-white">
          <DialogHeader>
            <DialogTitle>Produto adicionado</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-marrom-300">
            Quer avançar para o carrinho ou continuar comprando?
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" className={darkOutlineButtonClass} onClick={() => setPromptNovoItemOpen(false)}>
              Continuar comprando
            </Button>
            <Button
              className={accentButtonClass}
              onClick={() => {
                setPromptNovoItemOpen(false);
                setCarrinhoOpen(true);
              }}
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              Ir para o carrinho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={foraDeAreaModalOpen} onOpenChange={setForaDeAreaModalOpen}>
        <DialogContent className="max-w-sm border-marrom-800 bg-marrom-950 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-amber-400" />
              Endereço fora da área de entrega
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-marrom-200">
            <p>
              Esse endereço está a{" "}
              <span className="font-semibold text-white">
                {Number(freteInfo?.distanciaKm || 0).toFixed(1)} km
              </span>{" "}
              da loja, acima do limite de 5 km para delivery próprio.
            </p>
            <p>
              Você pode chamar um <span className="font-semibold text-white">Uber Flash ou 99</span> para retirar
              seu pedido na{" "}
              <span className="font-semibold text-white">
                {freteInfo?.enderecoRetirada || "nossa loja"}
              </span>{" "}
              e levar até você, ou retirar você mesmo na loja.
            </p>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button className={`w-full ${accentButtonClass}`} onClick={escolherUberFlash}>
              <MessageCircle className="h-4 w-4 mr-2" />
              Vou chamar um Uber Flash / 99
            </Button>
            <Button variant="outline" className={`w-full ${darkOutlineButtonClass}`} onClick={escolherRetiradaNaLoja}>
              Prefiro retirar na loja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
