import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  conteudo: string;
  resposta?: string | null;
  origem?: string;
  criadoEm: string;
  tipo?: string;
}

function detectImageUrls(text: string): string[] {
  if (!text) return [];
  const urls = text.match(/https?:\/\/[^\s)]+/gi) || [];
  return urls.filter((url) => {
    const lower = url.toLowerCase();
    return (
      lower.includes("/uploads/") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".png") ||
      lower.endsWith(".webp") ||
      lower.endsWith(".gif")
    );
  });
}

function detectAudioUrls(text: string): string[] {
  if (!text) return [];
  const urls = text.match(/https?:\/\/[^\s)]+/gi) || [];
  return urls.filter((url) => {
    const lower = url.toLowerCase();
    return (
      lower.endsWith(".ogg") ||
      lower.endsWith(".opus") ||
      lower.endsWith(".mp3") ||
      lower.endsWith(".m4a") ||
      lower.endsWith(".wav") ||
      lower.endsWith(".webm") ||
      lower.endsWith(".amr")
    );
  });
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function MessageContent({ text }: { text: string }) {
  const images = detectImageUrls(text);
  const audios = detectAudioUrls(text);
  const media = [...images, ...audios];
  const cleanText = media.reduce((t, url) => t.replace(url, "").trim(), text);

  return (
    <>
      {cleanText && <p className="text-sm whitespace-pre-wrap break-words">{cleanText}</p>}
      {images.map((url, i) => (
        <img
          key={`img-${i}`}
          src={url}
          alt="Imagem"
          className="mt-1 max-w-[200px] rounded-md"
          loading="lazy"
        />
      ))}
      {audios.map((url, i) => (
        <audio key={`audio-${i}`} controls preload="none" src={url} className="mt-1 max-w-[220px]" />
      ))}
    </>
  );
}

export function MessageBubble({ conteudo, resposta, origem, criadoEm, tipo }: MessageBubbleProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* Mensagem do cliente (esquerda) — nao se aplica a mensagens enviadas pelo operador */}
      {origem !== "MANUAL" && (
        <div className="flex justify-start">
          <div className={cn("max-w-[75%] rounded-2xl rounded-tl-sm px-3 py-2 bg-muted")}>
            <MessageContent text={conteudo} />
            <span className="block text-[10px] text-muted-foreground mt-1 text-right">
              {formatDate(criadoEm)} {formatTime(criadoEm)}
            </span>
          </div>
        </div>
      )}

      {/* Resposta (direita) */}
      {resposta && (
        <div className="flex justify-end">
          <div
            className={cn(
              "max-w-[75%] rounded-2xl rounded-tr-sm px-3 py-2",
              origem === "MANUAL"
                ? "bg-green-50 dark:bg-green-950/30"
                : "bg-primary/10"
            )}
          >
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-[10px] font-medium text-muted-foreground">
                {origem === "MANUAL" ? "Operador" : "IA"}
              </span>
            </div>
            <MessageContent text={resposta} />
            <span className="block text-[10px] text-muted-foreground mt-1 text-right">
              {formatDate(criadoEm)} {formatTime(criadoEm)}
            </span>
          </div>
        </div>
      )}

      {/* Mensagem manual sem resposta (enviada pelo painel) */}
      {!resposta && origem === "MANUAL" && (
        <div className="flex justify-end">
          <div className="max-w-[75%] rounded-2xl rounded-tr-sm px-3 py-2 bg-green-50 dark:bg-green-950/30">
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-[10px] font-medium text-muted-foreground">Operador</span>
            </div>
            <MessageContent text={conteudo} />
            <span className="block text-[10px] text-muted-foreground mt-1 text-right">
              {formatDate(criadoEm)} {formatTime(criadoEm)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
