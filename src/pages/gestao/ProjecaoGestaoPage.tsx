import { useQuery } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown, BarChart3, CalendarRange, ArrowRight } from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ProjecaoGestaoPage() {
  const navigate = useNavigate();
  const hoje = new Date();
  const inicio = format(subDays(hoje, 30), "yyyy-MM-dd");
  const fim = format(hoje, "yyyy-MM-dd");

  const { data: resumoFinanceiro } = useQuery({
    queryKey: ["projecao-financeiro"],
    queryFn: () => api.get<any>(`/api/financeiro/resumo?dataInicio=${inicio}&dataFim=${fim}`),
  });

  const { data: pedidos } = useQuery({
    queryKey: ["projecao-pedidos"],
    queryFn: () => api.get<any>(`/api/pedidos?dataInicio=${inicio}&dataFim=${fim}&limit=500`),
  });

  const totalPedidos = pedidos?.pedidos?.length ?? 0;
  const receita30d = resumoFinanceiro?.receita ?? 0;
  const custos30d = resumoFinanceiro?.custos ?? 0;
  const mediaDiariaReceita = receita30d / 30;
  const mediaDiariaPedidos = totalPedidos / 30;
  const projecaoReceita30d = mediaDiariaReceita * 30;
  const projecaoPedidos30d = mediaDiariaPedidos * 30;
  const projecaoMargem = projecaoReceita30d - custos30d;
  const projecaoMargemPct = projecaoReceita30d > 0 ? (projecaoMargem / projecaoReceita30d) * 100 : 0;

  const cards = [
    { label: "Receita Projetada", value: fmt(projecaoReceita30d), icon: TrendingUp, color: "bg-emerald-100 text-emerald-700" },
    { label: "Pedidos Projetados", value: Math.round(projecaoPedidos30d).toString(), icon: CalendarRange, color: "bg-blue-100 text-blue-700" },
    { label: "Margem Projetada", value: fmt(projecaoMargem), icon: BarChart3, color: "bg-violet-100 text-violet-700" },
    { label: "Margem % Projetada", value: `${projecaoMargemPct.toFixed(1)}%`, icon: TrendingDown, color: "bg-amber-100 text-amber-700" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Projeção</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Estimativa baseada nos últimos 30 dias em {format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/gestao/kpis")}>
          <ArrowRight className="h-4 w-4 mr-2" />
          Ver KPIs
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="pt-4 pb-3">
              <div className={`inline-flex rounded-lg p-2 mb-2 ${card.color.split(" ")[0]}`}>
                <card.icon className={`h-4 w-4 ${card.color.split(" ")[1]}`} />
              </div>
              <p className="text-2xl font-bold">{card.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leitura rápida</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Nos últimos 30 dias a operação gerou {fmt(receita30d)} de receita e {fmt(custos30d)} de custos.
          </p>
          <p>
            Mantendo a média atual, a projeção para o próximo ciclo de 30 dias é de {fmt(projecaoReceita30d)}
            em receita e {fmt(projecaoMargem)} de margem.
          </p>
          <Badge variant="secondary" className="w-fit">
            Página dedicada de projeção
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
