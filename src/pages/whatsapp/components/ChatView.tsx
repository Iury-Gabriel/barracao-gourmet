import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/hooks/useApi";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Bot, Hand, Play, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { API_URL } from "@/lib/apiBaseUrl";

interface Mensagem {
  id: string;
  conteudo: string;
  resposta: string | null;
  tipo: string;
  origem: string;
  criadoEm: string;
}

interface ChatViewProps {
  instanciaId: string;
  remetente: string;
  clienteNome?: string | null;
  instanciaTipo?: string;
  onBack?: () => void;
}

export function ChatView({ instanciaId, remetente, clienteNome, instanciaTipo, onBack }: ChatViewProps) {
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["atendimento-mensagens", instanciaId, remetente],
    queryFn: () =>
      api.get<{ mensagens: Mensagem[]; total: number; iaPausada: boolean }>(
        `/api/atendimentos/conversas/${instanciaId}/${remetente}/mensagens?limit=100`
      ),
    refetchInterval: 10000,
  });

  const iaPausada = Boolean(data?.iaPausada);

  const enviarMutation = useMutation({
    mutationFn: (texto: string) =>
      api.post(`/api/atendimentos/conversas/${instanciaId}/${remetente}/enviar`, { texto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["atendimento-mensagens", instanciaId, remetente] });
      queryClient.invalidateQueries({ queryKey: ["atendimento-conversas"] });
    },
    onError: () => {
      toast.error("Falha ao enviar mensagem");
    },
  });

  const enviarMidiaMutation = useMutation({
    mutationFn: async ({ tipo, file }: { tipo: "IMAGEM" | "AUDIO"; file: File }) => {
      const formData = new FormData();
      formData.append("arquivo", file);
      const token = localStorage.getItem("barracao_token");
      const upRes = await fetch(`${API_URL}/api/upload/midia`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!upRes.ok) {
        const err = await upRes.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao enviar arquivo.");
      }
      const { url } = await upRes.json();
      return api.post(`/api/atendimentos/conversas/${instanciaId}/${remetente}/enviar-midia`, { tipo, url });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["atendimento-mensagens", instanciaId, remetente] });
      queryClient.invalidateQueries({ queryKey: ["atendimento-conversas"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Falha ao enviar mídia");
    },
  });

  const limparHistoricoMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/atendimentos/conversas/${instanciaId}/${remetente}/limpar-historico`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["atendimento-mensagens", instanciaId, remetente] });
      queryClient.invalidateQueries({ queryKey: ["atendimento-conversas"] });
      toast.success("Contexto da conversa apagado.");
    },
    onError: () => {
      toast.error("Não foi possível apagar o contexto.");
    },
  });

  const pausaMutation = useMutation({
    mutationFn: (pausar: boolean) =>
      api.post(
        `/api/atendimentos/conversas/${instanciaId}/${remetente}/ia/${pausar ? "pausar" : "retomar"}`,
        {}
      ),
    onSuccess: (_data, pausar) => {
      queryClient.invalidateQueries({ queryKey: ["atendimento-mensagens", instanciaId, remetente] });
      toast.success(pausar ? "Você assumiu o atendimento. IA pausada." : "Atendimento devolvido para a IA.");
    },
    onError: () => {
      toast.error("Não foi possível atualizar o atendimento.");
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.mensagens]);

  const formatPhone = (phone: string) => {
    if (phone.length === 13) {
      return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`;
    }
    return phone;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3 shrink-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {(clienteNome || remetente).slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">
            {clienteNome || formatPhone(remetente)}
          </p>
          <p className="text-xs text-muted-foreground">
            {clienteNome ? formatPhone(remetente) : ""} {instanciaTipo && `· ${instanciaTipo}`}
          </p>
        </div>
        {iaPausada ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pausaMutation.isPending}
            onClick={() => pausaMutation.mutate(false)}
          >
            <Play className="h-4 w-4 mr-1.5" />
            Retomar IA
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={pausaMutation.isPending}
            onClick={() => pausaMutation.mutate(true)}
          >
            <Hand className="h-4 w-4 mr-1.5" />
            Assumir atendimento
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={limparHistoricoMutation.isPending}
          onClick={() => {
            if (window.confirm("Apagar todo o contexto/histórico desta conversa? Esta ação não pode ser desfeita.")) {
              limparHistoricoMutation.mutate();
            }
          }}
          title="Apagar contexto da conversa"
        >
          <Trash2 className="h-4 w-4 mr-1.5" />
          Apagar contexto
        </Button>
      </div>

      {/* Banner de IA pausada */}
      {iaPausada && (
        <div className="flex items-center gap-2 border-b bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 shrink-0">
          <Bot className="h-4 w-4" />
          IA pausada — atendimento humano. As mensagens do cliente não recebem resposta automática.
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-3/4" />
            ))}
          </div>
        )}
        {data?.mensagens.map((msg) => (
          <MessageBubble
            key={msg.id}
            conteudo={msg.conteudo}
            resposta={msg.resposta}
            origem={msg.origem}
            criadoEm={msg.criadoEm}
            tipo={msg.tipo}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <MessageInput
        onSend={(texto) => enviarMutation.mutate(texto)}
        onSendMidia={(tipo, file) => enviarMidiaMutation.mutate({ tipo, file })}
        disabled={enviarMutation.isPending}
        uploading={enviarMidiaMutation.isPending}
      />
    </div>
  );
}
