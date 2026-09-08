import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, TrendingUp, UserCheck, UserX, Calendar, ShoppingCart, MessageCircle, Gift, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { ClienteDetailDialog } from "@/components/shared/ClienteDetailDialog";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// So os digitos, no formato que o link do WhatsApp aceita.
function whatsappLink(telefone?: string | null, mensagem?: string) {
  const limpo = (telefone || "").replace(/\D/g, "");
  if (limpo.length < 10) return null;
  const numero = limpo.startsWith("55") ? limpo : "55" + limpo;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem || "")}`;
}

const primeiroNome = (nome?: string) => (nome || "").trim().split(" ")[0] || "tudo bem";

// Mensagens prontas: a equipe so confere e envia, sem escrever na hora.
function textoReativacao(nome?: string) {
  return `Oi, ${primeiroNome(nome)}! Aqui e do Barracao. Sentimos sua falta por aqui! Ja faz um tempo que voce nao pede com a gente. Da uma olhada no cardapio de hoje, vai que bate a vontade. Fica com Deus!`;
}

function textoReclamacao(nome?: string) {
  return `Oi, ${primeiroNome(nome)}! Aqui e do Barracao. Vi o que aconteceu no seu ultimo pedido e queria pedir desculpas. Isso nao e o nosso padrao. Quero deixar a situacao acertada com voce, posso te ajudar?`;
}

export default function RecorrenciaClientesPage() {
  const [clienteSelecionado, setClienteSelecionado] = useState<string | null>(null);
  const [clienteModalOpen, setClienteModalOpen] = useState(false);

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => api.get<any[]>("/api/clientes"),
  });

  const { data: kpis } = useQuery({
    queryKey: ["clientes-kpis"],
    queryFn: () => api.get<any>("/api/clientes/kpis"),
  });

  const recorrentes = clientes.filter((c: any) => c.recorrente);
  const fieis = clientes.filter((c: any) => c.fiel);
  const comReclamacao = clientes.filter((c: any) => c.reclamacao);

  // Gera o cupom no servidor e ja abre o WhatsApp com o codigo na mensagem:
  // sem isso a equipe teria que criar o cupom a mao e copiar o codigo.
  const cupomFidelidade = useMutation({
    mutationFn: (clienteId: string) => api.post<any>(`/api/clientes/${clienteId}/cupom-fidelidade`, {}),
    onSuccess: (dados: any, clienteId: string) => {
      const cliente = clientes.find((c: any) => c.id === clienteId);
      const favorito = dados.produtoFavorito
        ? ` Reparei que voce gosta bastante do nosso ${dados.produtoFavorito}.`
        : "";
      const texto =
        `Oi, ${primeiroNome(dados.nome || cliente?.nome)}! Aqui e do Barracao. ` +
        `Voce ja fez ${dados.totalPedidos} pedidos com a gente e a gente queria muito te agradecer por isso.${favorito} ` +
        `Separei um cupom de ${dados.percentual}% de desconto so pra voce: ${dados.codigo}. ` +
        `Se quiser, a gente leva ai na sua casa. Fica com Deus!`;
      const link = whatsappLink(dados.telefone || cliente?.telefone, texto);
      if (link) window.open(link, "_blank");
      else toast.success(`Cupom ${dados.codigo} criado (cliente sem telefone valido).`);
    },
    onError: (err: any) => toast.error(err.message),
  });
  const inativos = clientes.filter((c: any) => c.inativo);
  const novos = clientes.filter((c: any) => {
    return (Date.now() - new Date(c.criadoEm).getTime()) / (1000 * 60 * 60 * 24) <= 30;
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-muted-foreground animate-pulse">Carregando...</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recorrência de Clientes</h1>
        <p className="text-muted-foreground text-sm mt-1">Análise de fidelidade e retenção</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total de Clientes",  value: kpis?.total ?? 0,       icon: Users,      color: "bg-blue-100 text-blue-700" },
          { label: "Recorrentes (3+)",   value: kpis?.recorrentes ?? 0, icon: UserCheck,  color: "bg-emerald-100 text-emerald-700" },
          { label: "Inativos (+30d)",    value: kpis?.inativos ?? 0,    icon: UserX,      color: "bg-red-100 text-red-700" },
          { label: "Novos (30d)",        value: kpis?.novos30dias ?? 0, icon: Calendar,   color: "bg-violet-100 text-violet-700" },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-3">
              <div className={`inline-flex rounded-lg p-2 mb-2 ${k.color.split(" ")[0]}`}>
                <k.icon className={`h-4 w-4 ${k.color.split(" ")[1]}`} />
              </div>
              <p className="text-2xl font-bold">{k.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Clientes recorrentes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-emerald-600" />
              Clientes Recorrentes ({recorrentes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recorrentes.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">Nenhum cliente recorrente ainda</p>
            ) : (
              <div className="space-y-2">
                {recorrentes.slice(0, 10).map((c: any) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between py-2 border-b last:border-0 cursor-pointer hover:bg-muted/30 rounded px-1"
                    onClick={() => { setClienteSelecionado(c.id); setClienteModalOpen(true); }}
                  >
                    <div>
                      <p className="text-sm font-medium">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">{c.telefone}</p>
                    </div>
                    <div className="text-right">
                      <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                        <ShoppingCart className="h-3 w-3 mr-1" />
                        {c.totalPedidos} pedidos
                      </Badge>
                      {c.ultimoPedido && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(c.ultimoPedido), { locale: ptBR, addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Clientes inativos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserX className="h-4 w-4 text-red-600" />
              Clientes Inativos ({inativos.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {inativos.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">Nenhum cliente inativo</p>
            ) : (
              <div className="space-y-2">
                {inativos.slice(0, 10).map((c: any) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between py-2 border-b last:border-0 cursor-pointer hover:bg-muted/30 rounded px-1"
                    onClick={() => { setClienteSelecionado(c.id); setClienteModalOpen(true); }}
                  >
                    <div>
                      <p className="text-sm font-medium">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">{c.telefone}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <Badge className="bg-red-100 text-red-700 text-xs">
                          {c.diasSemPedido}d sem pedido
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-0.5">{c.totalPedidos} pedidos total</p>
                      </div>
                      {whatsappLink(c.telefone, textoReativacao(c.nome)) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 gap-1 text-emerald-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(whatsappLink(c.telefone, textoReativacao(c.nome))!, "_blank");
                          }}
                        >
                          <MessageCircle className="h-4 w-4" />
                          Chamar
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Clientes fieis: 10+ pedidos rende agradecimento com cupom. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="h-4 w-4 text-emerald-500" />
            Clientes Fieis ({fieis.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            A partir de 10 pedidos. O botao cria um cupom de 10% e abre o WhatsApp com o
            agradecimento, citando o prato que ele mais pede.
          </p>
        </CardHeader>
        <CardContent>
          {fieis.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">
              Nenhum cliente chegou a 10 pedidos ainda
            </p>
          ) : (
            <div className="space-y-2">
              {fieis.slice(0, 15).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between gap-2 border-b py-2 last:border-0">
                  <div
                    className="min-w-0 cursor-pointer"
                    onClick={() => { setClienteSelecionado(c.id); setClienteModalOpen(true); }}
                  >
                    <p className="truncate text-sm font-medium">{c.nome}</p>
                    <p className="text-xs text-muted-foreground">{c.telefone}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                      {c.totalPedidos} pedidos
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-emerald-500"
                      disabled={cupomFidelidade.isPending}
                      onClick={() => cupomFidelidade.mutate(c.id)}
                    >
                      <Gift className="h-4 w-4" />
                      {cupomFidelidade.isPending ? "Gerando..." : "Cupom"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quem reclamou: a equipe reativa antes que o cliente va embora. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            Reclamacoes Abertas ({comReclamacao.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Registre a reclamacao em Clientes &gt; Interacoes para o cliente aparecer aqui.
          </p>
        </CardHeader>
        <CardContent>
          {comReclamacao.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">Nenhuma reclamacao registrada</p>
          ) : (
            <div className="space-y-2">
              {comReclamacao.slice(0, 15).map((c: any) => (
                <div key={c.id} className="flex items-start justify-between gap-2 border-b py-2 last:border-0">
                  <div
                    className="min-w-0 cursor-pointer"
                    onClick={() => { setClienteSelecionado(c.id); setClienteModalOpen(true); }}
                  >
                    <p className="truncate text-sm font-medium">{c.nome}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{c.reclamacao.descricao}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(c.reclamacao.criadoEm), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    {whatsappLink(c.telefone, textoReclamacao(c.nome)) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-emerald-500"
                        onClick={() => window.open(whatsappLink(c.telefone, textoReclamacao(c.nome))!, "_blank")}
                      >
                        <MessageCircle className="h-4 w-4" />
                        Falar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={cupomFidelidade.isPending}
                      onClick={() => cupomFidelidade.mutate(c.id)}
                    >
                      <Gift className="h-4 w-4" />
                      Cupom
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ClienteDetailDialog
        open={clienteModalOpen}
        onOpenChange={setClienteModalOpen}
        clienteId={clienteSelecionado}
      />
    </div>
  );
}
