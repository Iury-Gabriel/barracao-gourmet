import { useEffect, useRef, useState } from "react";
import { Send, ImagePlus, Mic, Square, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface MessageInputProps {
  onSend: (texto: string) => void;
  onSendMidia: (tipo: "IMAGEM" | "AUDIO", file: File) => void;
  disabled?: boolean;
  uploading?: boolean;
}

function escolherMimeType(): string | undefined {
  const candidatos = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  if (typeof MediaRecorder === "undefined") return undefined;
  return candidatos.find((m) => MediaRecorder.isTypeSupported(m));
}

function extensaoPorMime(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "m4a";
  return "ogg";
}

export function MessageInput({ onSend, onSendMidia, disabled, uploading }: MessageInputProps) {
  const [texto, setTexto] = useState("");
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const cancelarRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const bloqueado = disabled || uploading || gravando;

  const handleSend = () => {
    const trimmed = texto.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setTexto("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImagem = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onSendMidia("IMAGEM", file);
  };

  const pararTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const iniciarGravacao = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Gravação de áudio não suportada neste navegador.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = escolherMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      cancelarRef.current = false;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        pararTimer();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setGravando(false);
        setSegundos(0);
        if (cancelarRef.current) return;
        const tipoReal = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: tipoReal });
        if (blob.size === 0) return;
        const ext = extensaoPorMime(tipoReal);
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: tipoReal });
        onSendMidia("AUDIO", file);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setGravando(true);
      setSegundos(0);
      timerRef.current = window.setInterval(() => setSegundos((s) => s + 1), 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone.");
    }
  };

  const finalizarGravacao = (cancelar: boolean) => {
    cancelarRef.current = cancelar;
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  };

  const formatSeg = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (gravando) {
    return (
      <div className="flex items-center gap-3 border-t p-3 bg-background">
        <span className="flex h-3 w-3 shrink-0 animate-pulse rounded-full bg-red-500" />
        <span className="flex-1 text-sm text-muted-foreground">Gravando áudio… {formatSeg(segundos)}</span>
        <Button size="icon" variant="ghost" onClick={() => finalizarGravacao(true)} title="Cancelar">
          <X className="h-4 w-4" />
        </Button>
        <Button size="icon" onClick={() => finalizarGravacao(false)} title="Enviar áudio">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2 border-t p-3 bg-background">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImagem}
      />
      <Button
        size="icon"
        variant="ghost"
        className="shrink-0"
        disabled={bloqueado}
        onClick={() => fileInputRef.current?.click()}
        title="Enviar imagem"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="shrink-0"
        disabled={bloqueado}
        onClick={iniciarGravacao}
        title="Gravar áudio"
      >
        <Mic className="h-4 w-4" />
      </Button>
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Digite uma mensagem..."
        className="min-h-[40px] max-h-[120px] resize-none"
        rows={1}
        disabled={disabled}
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={disabled || !texto.trim()}
        className="shrink-0"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
