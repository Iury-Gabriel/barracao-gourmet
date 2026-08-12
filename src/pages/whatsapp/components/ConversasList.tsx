import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface Conversa {
  remetente: string;
  instanciaId: string;
  instanciaNome: string;
  instanciaTipo: string;
  ultimaMensagem: string;
  ultimaData: string;
  totalMensagens: number;
  clienteNome: string | null;
  clienteId: string | null;
}

interface ConversasListProps {
  selectedKey: string | null;
  onSelect: (conversa: Conversa) => void;
}

function formatRelativeDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatPhone(phone: string) {
  if (phone.length === 13) {
    return `(${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`;
  }
  if (phone.length >= 10) {
    return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`;
  }
  return phone;
}

export function ConversasList({ selectedKey, onSelect }: ConversasListProps) {
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<string>("TODOS");

  const { data: conversas = [], isLoading } = useQuery({
    queryKey: ["atendimento-conversas", tipoFiltro, busca],
    queryFn: () => {
      const params = new URLSearchParams();
      if (tipoFiltro !== "TODOS") params.set("tipo", tipoFiltro);
      if (busca) params.set("busca", busca);
      return api.get<Conversa[]>(`/api/atendimentos/conversas?${params.toString()}`);
    },
    refetchInterval: 15000,
  });

  return (
    <div className="flex flex-col h-full border-r">
      {/* Header */}
      <div className="p-3 border-b space-y-2 shrink-0">
        <h2 className="text-sm font-semibold">Atendimentos</h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar contato..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todas instâncias</SelectItem>
            <SelectItem value="ATENDIMENTO">Atendimento</SelectItem>
            <SelectItem value="GESTAO">Gestão</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-3 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}
        {!isLoading && conversas.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Nenhuma conversa encontrada
          </div>
        )}
        {conversas.map((conversa) => {
          const key = `${conversa.instanciaId}|${conversa.remetente}`;
          const isSelected = selectedKey === key;
          return (
            <button
              key={key}
              onClick={() => onSelect(conversa)}
              className={cn(
                "w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                isSelected && "bg-muted"
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {(conversa.clienteNome || conversa.remetente).slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-medium truncate">
                    {conversa.clienteNome || formatPhone(conversa.remetente)}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatRelativeDate(conversa.ultimaData)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {conversa.ultimaMensagem}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                    {conversa.instanciaTipo === "GESTAO" ? "Gestão" : "Atendimento"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {conversa.totalMensagens} msg
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
