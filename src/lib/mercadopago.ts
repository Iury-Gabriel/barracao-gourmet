// Public key do Mercado Pago (nao e segredo — usada no navegador para tokenizar o cartao).
// Pode ser sobrescrita por VITE_MP_PUBLIC_KEY no build.
export const MP_PUBLIC_KEY =
  (import.meta.env.VITE_MP_PUBLIC_KEY as string | undefined) ||
  "APP_USR-5f35f03c-ffc7-4904-805a-d771c1094ed3";

let sdkPromise: Promise<any> | null = null;
let mpInstance: any = null;

// Retorna uma instancia unica do MercadoPago (para tokenizar cartao salvo).
export async function getMercadoPagoInstance(): Promise<any> {
  const MercadoPago = await loadMercadoPago();
  if (!mpInstance) mpInstance = new MercadoPago(MP_PUBLIC_KEY, { locale: "pt-BR" });
  return mpInstance;
}

// Gera um token a partir de um cartao ja salvo (card_id) + o CVV digitado.
export async function tokenizarCartaoSalvo(cardId: string, securityCode: string): Promise<string> {
  const mp = await getMercadoPagoInstance();
  const resultado = await mp.createCardToken({ cardId, securityCode });
  const token = resultado?.id || resultado?.token;
  if (!token) throw new Error("Não foi possível validar o cartão salvo.");
  return String(token);
}

// Carrega a SDK v2 do Mercado Pago (uma unica vez) e resolve com o construtor MercadoPago.
export function loadMercadoPago(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("Sem window"));
  if ((window as any).MercadoPago) return Promise.resolve((window as any).MercadoPago);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const existente = document.querySelector<HTMLScriptElement>('script[data-mp-sdk="1"]');
    const onReady = () => {
      if ((window as any).MercadoPago) resolve((window as any).MercadoPago);
      else reject(new Error("SDK do Mercado Pago nao carregou"));
    };
    if (existente) {
      existente.addEventListener("load", onReady);
      existente.addEventListener("error", () => reject(new Error("Falha ao carregar SDK do Mercado Pago")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.dataset.mpSdk = "1";
    script.onload = onReady;
    script.onerror = () => reject(new Error("Falha ao carregar SDK do Mercado Pago"));
    document.head.appendChild(script);
  });

  return sdkPromise;
}
