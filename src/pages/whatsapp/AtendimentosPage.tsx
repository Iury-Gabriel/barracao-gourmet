import { useState } from "react";
import { ConversasList } from "./components/ConversasList";
import { ChatView } from "./components/ChatView";
import { MessageCircle } from "lucide-react";

interface SelectedConversa {
  instanciaId: string;
  remetente: string;
  clienteNome: string | null;
  instanciaTipo: string;
}

export default function AtendimentosPage() {
  const [selected, setSelected] = useState<SelectedConversa | null>(null);
  const selectedKey = selected ? `${selected.instanciaId}|${selected.remetente}` : null;

  return (
    <div className="flex h-[calc(100vh-56px-2rem)] lg:h-[calc(100vh-3rem)] overflow-hidden -m-4 md:-m-6">
      {/* Lista de conversas: tela cheia no mobile; escondida no mobile quando uma conversa esta aberta */}
      <div className={`${selected ? "hidden sm:block" : "block"} w-full sm:w-[320px] lg:w-[340px] shrink-0 h-full overflow-hidden`}>
        <ConversasList
          selectedKey={selectedKey}
          onSelect={(conversa) =>
            setSelected({
              instanciaId: conversa.instanciaId,
              remetente: conversa.remetente,
              clienteNome: conversa.clienteNome,
              instanciaTipo: conversa.instanciaTipo,
            })
          }
        />
      </div>

      {/* Chat: tela cheia no mobile quando ha conversa aberta; escondido no mobile quando nao ha */}
      <div className={`${selected ? "flex" : "hidden"} sm:flex flex-1 min-w-0 h-full overflow-hidden`}>
        {selected ? (
          <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
            <ChatView
              instanciaId={selected.instanciaId}
              remetente={selected.remetente}
              clienteNome={selected.clienteNome}
              instanciaTipo={selected.instanciaTipo}
              onBack={() => setSelected(null)}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Selecione uma conversa para visualizar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
