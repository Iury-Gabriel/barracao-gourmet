import { Bot, Zap, Bell, Users, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const automacoes = [
  {
    icon: Users,
    titulo: "Reativação de Clientes Inativos",
    descricao: "Disparo automático de mensagem para clientes sem pedido há mais de 30 dias, com oferta personalizada.",
    status: "Em breve",
    categoria: "Comercial",
  },
  {
    icon: Bell,
    titulo: "Alerta de Estoque Mínimo",
    descricao: "Notificação automática quando um produto atinge o estoque mínimo configurado.",
    status: "Em breve",
    categoria: "Operacional",
  },
  {
    icon: Zap,
    titulo: "Confirmação Automática de Pedido",
    descricao: "Envio automático de mensagem de confirmação ao cliente quando o pedido é recebido.",
    status: "Em breve",
    categoria: "Operacional",
  },
  {
    icon: RefreshCw,
    titulo: "Fluxo de Recorrência",
    descricao: "Identificação de padrão de compra e disparo de lembrete personalizado no período de recorrência do cliente.",
    status: "Em breve",
    categoria: "Comercial",
  },
  {
    icon: Bot,
    titulo: "Fluxos Promocionais",
    descricao: "Segmentação automática de clientes por perfil de consumo e envio de promoções direcionadas.",
    status: "Em breve",
    categoria: "Comercial",
  },
  {
    icon: Bell,
    titulo: "Notificação de Status do Pedido",
    descricao: "Atualização automática do cliente a cada mudança de status do pedido via WhatsApp.",
    status: "Em breve",
    categoria: "Operacional",
  },
];

export default function AutomacoesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Automações</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Fluxos automáticos para operação, comunicação e retenção de clientes
        </p>
      </div>

      {/* Banner */}
      <div className="rounded-xl border bg-primary/5 border-primary/20 p-6 flex items-start gap-4">
        <div className="rounded-xl p-3 bg-primary/10 flex-shrink-0">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-lg">Módulo de Automações</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Este módulo está em desenvolvimento. As automações abaixo serão implementadas na próxima fase do sistema,
            integrando com WhatsApp, e-mail e notificações internas para automatizar a operação do Barracão Gourmet.
          </p>
        </div>
      </div>

      {/* Grid de automações */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {automacoes.map((a, i) => (
          <Card key={i} className="opacity-75">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg p-2 bg-muted">
                    <a.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-sm leading-tight">{a.titulo}</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">{a.descricao}</p>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">{a.categoria}</Badge>
                <Badge className="bg-amber-100 text-amber-700 text-xs">{a.status}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
