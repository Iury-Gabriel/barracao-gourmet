import { useEffect, useRef, useState } from "react";
import { getMercadoPagoInstance } from "@/lib/mercadopago";

export interface CartaoTokenizado {
  token: string;
  tokenSave?: string; // token separado para salvar o cartao no customer
  paymentMethodId: string;
  issuerId?: string;
  installments: number;
  identificationType?: string;
  identificationNumber?: string;
  email?: string;
  salvar?: boolean;
  cartaoSalvoId?: string;
}

interface Props {
  amount: number;
  emailInicial?: string;
  disabled?: boolean;
  processando?: boolean;
  salvar?: boolean;
  onToken: (data: CartaoTokenizado) => void;
  onEmailChange?: (email: string) => void;
}

// Corrige typos comuns e inequivocos de TLD (".con"/".comm" nao existem de verdade,
// entao e seguro corrigir sem risco de mexer num dominio valido por engano).
function corrigirTypoEmail(email: string) {
  return email.replace(/\.(con|comm)$/i, ".com");
}

// Campos seguros (iframes do MP) com fundo claro para legibilidade no tema escuro.
const secureFieldClass = "h-11 rounded-md border border-zinc-300 bg-white px-3";
const inputClass =
  "h-11 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500";

export function CardFormMercadoPago({ amount, emailInicial, disabled, processando, salvar, onToken, onEmailChange }: Props) {
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState(emailInicial || "");
  const [gerando, setGerando] = useState(false);

  const mpRef = useRef<any>(null);
  const pmRef = useRef<string>("");
  const issuerRef = useRef<string | undefined>(undefined);
  const fieldsRef = useRef<any[]>([]);

  useEffect(() => {
    let cancelado = false;
    getMercadoPagoInstance()
      .then((mp) => {
        if (cancelado) return;
        mpRef.current = mp;
        const style = { color: "#111111", "font-size": "16px" };
        const cardNumber = mp.fields.create("cardNumber", { placeholder: "0000 0000 0000 0000", style }).mount("mp-card-number");
        const expiration = mp.fields.create("expirationDate", { placeholder: "MM/AA", style }).mount("mp-card-exp");
        const security = mp.fields.create("securityCode", { placeholder: "CVV", style }).mount("mp-card-cvv");
        fieldsRef.current = [cardNumber, expiration, security];
        setPronto(true);

        cardNumber.on("binChange", async (data: any) => {
          try {
            const bin = data?.bin;
            if (!bin) {
              pmRef.current = "";
              issuerRef.current = undefined;
              return;
            }
            const pm = await mp.getPaymentMethods({ bin });
            const first = pm?.results?.[0];
            if (first) {
              pmRef.current = String(first.id);
              try {
                const issuers = await mp.getIssuers({ paymentMethodId: first.id, bin });
                issuerRef.current = issuers?.[0]?.id ? String(issuers[0].id) : undefined;
              } catch {
                issuerRef.current = undefined;
              }
            }
          } catch {
            /* ignore */
          }
        });

        cardNumber.on("ready", () => setPronto(true));
      })
      .catch(() => setErro("Não foi possível carregar o Mercado Pago. Verifique a conexão."));

    return () => {
      cancelado = true;
      fieldsRef.current.forEach((f) => {
        try {
          f.unmount();
        } catch {
          /* ignore */
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pagar = async () => {
    setErro("");
    const mp = mpRef.current;
    if (!mp) return;
    if (!pmRef.current) {
      setErro("Confira o número do cartão.");
      return;
    }
    if (cpf.replace(/\D/g, "").length < 11) {
      setErro("Informe um CPF válido.");
      return;
    }
    if (!nome.trim()) {
      setErro("Informe o nome impresso no cartão.");
      return;
    }
    setGerando(true);
    try {
      const dados = { cardholderName: nome.trim(), identificationType: "CPF", identificationNumber: cpf.replace(/\D/g, "") };
      const tokenPay = await mp.fields.createCardToken(dados);
      let tokenSave: any = undefined;
      if (salvar) {
        try {
          tokenSave = await mp.fields.createCardToken(dados);
        } catch {
          /* se falhar so o de salvar, segue o pagamento */
        }
      }
      onToken({
        token: tokenPay.id,
        tokenSave: tokenSave?.id,
        paymentMethodId: pmRef.current,
        issuerId: issuerRef.current,
        installments: 1,
        identificationType: "CPF",
        identificationNumber: cpf.replace(/\D/g, ""),
        email: email.trim(),
        salvar,
      });
    } catch {
      setErro("Não foi possível validar o cartão. Confira os dados.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs text-zinc-300">Número do cartão</label>
        <div id="mp-card-number" className={secureFieldClass} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-zinc-300">Validade</label>
          <div id="mp-card-exp" className={secureFieldClass} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-300">CVV</label>
          <div id="mp-card-cvv" className={secureFieldClass} />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-zinc-300">Nome impresso no cartão</label>
        <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} className={inputClass} placeholder="Nome impresso no cartão" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-zinc-300">CPF</label>
          <input type="text" value={cpf} onChange={(e) => setCpf(e.target.value)} className={inputClass} placeholder="000.000.000-00" inputMode="numeric" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-300">E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              const v = e.target.value.replace(/\s+/g, "");
              setEmail(v);
              onEmailChange?.(v);
            }}
            onBlur={(e) => {
              const corrigido = corrigirTypoEmail(e.target.value);
              if (corrigido !== e.target.value) {
                setEmail(corrigido);
                onEmailChange?.(corrigido);
              }
            }}
            className={inputClass}
            placeholder="email@email.com"
          />
        </div>
      </div>

      {erro && <p className="text-xs text-rose-400">{erro}</p>}

      <button
        type="button"
        onClick={pagar}
        disabled={disabled || processando || gerando || !pronto}
        className="h-11 w-full rounded-md bg-emerald-500 font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {processando || gerando
          ? "Processando pagamento..."
          : !pronto
            ? "Carregando cartão..."
            : `Pagar ${amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
      </button>
      <p className="text-center text-[10px] text-zinc-500">Pagamento processado pelo Mercado Pago</p>
    </div>
  );
}
