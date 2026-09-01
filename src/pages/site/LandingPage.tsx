import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowRight,
  ChefHat,
  Clock,
  Flame,
  Instagram,
  Mail,
  MapPin,
  Menu as MenuIcon,
  MessageCircle,
  Phone,
  Truck,
  UtensilsCrossed,
  X,
} from "lucide-react";
import {
  acompanhamentoPadrao,
  cardapioSemana,
  comoFunciona,
  especialidades,
  faq,
  galeria,
  heroDestaques,
  horarios,
  siteInfo,
  sobre,
} from "./siteContent";

// A landing publica nao segue o toggle de tema do painel: e sempre o tema escuro
// da marca (marrom do encarte + amarelo da logo), definido inline como no /cardapio.
const siteThemeVars: CSSProperties & Record<string, string> = {
  "--background": "12 30% 6%",
  "--foreground": "40 30% 96%",
  "--primary": "45 93% 58%",
  "--primary-foreground": "20 40% 8%",
  "--border": "16 26% 22%",
  "--ring": "45 93% 58%",
};

const NAV = [
  { href: "#sobre", label: "A casa" },
  { href: "#cardapio", label: "Prato do dia" },
  { href: "#especialidades", label: "Especialidades" },
  { href: "#ambiente", label: "Ambiente" },
  { href: "#visite", label: "Visite" },
];

function fmt(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const whatsappHref = `https://wa.me/${siteInfo.whatsapp.numero}?text=${encodeURIComponent(
  siteInfo.whatsapp.mensagem,
)}`;

// Contatos que o restaurante ainda nao divulgou ficam fora do ar em vez de
// virar link quebrado (wa.me sem numero, mailto vazio, perfil inexistente).
const temWhatsapp = Boolean(siteInfo.whatsapp.numero);
const temEmail = Boolean(siteInfo.email);
const temInstagram = Boolean(siteInfo.instagram.url);
const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  siteInfo.endereco.buscaMaps,
)}`;
const mapsEmbed = `https://www.google.com/maps?q=${encodeURIComponent(
  siteInfo.endereco.buscaMaps,
)}&output=embed`;

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.5, ease: "easeOut" },
} as const;

function SectionTitle({ overline, title, description }: { overline: string; title: string; description?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-400">{overline}</p>
      <h2 className="mt-3 text-3xl font-extrabold leading-tight text-amber-50 sm:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-base leading-relaxed text-marrom-200">{description}</p>}
    </div>
  );
}

export default function LandingPage() {
  const [menuAberto, setMenuAberto] = useState(false);

  // Abre o cardapio ja no dia de hoje; domingo (0) cai na segunda, que e quando reabrimos.
  const hoje = new Date().getDay();
  const [diaSelecionado, setDiaSelecionado] = useState(
    () => cardapioSemana.find((d) => d.chave === hoje)?.chave ?? cardapioSemana[0].chave,
  );
  const diaAtivo = useMemo(
    () => cardapioSemana.find((d) => d.chave === diaSelecionado) ?? cardapioSemana[0],
    [diaSelecionado],
  );

  return (
    <div className="min-h-screen bg-marrom-950 text-amber-50 antialiased" style={siteThemeVars}>
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-marrom-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#topo" className="flex items-center gap-3">
            <img src="/logo.png" alt={siteInfo.nome} className="h-10 w-10 object-contain" />
            <span className="text-lg font-extrabold tracking-tight text-amber-50">{siteInfo.nome}</span>
          </a>

          <nav className="hidden items-center gap-7 lg:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-marrom-200 transition-colors hover:text-amber-300"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/cardapio"
              className="hidden rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-marrom-950 transition-colors hover:bg-amber-300 sm:inline-flex"
            >
              Fazer pedido
            </Link>
            <button
              type="button"
              aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
              onClick={() => setMenuAberto((v) => !v)}
              className="rounded-xl border border-white/15 p-2 text-amber-50 transition-colors hover:bg-white/10 lg:hidden"
            >
              {menuAberto ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {menuAberto && (
          <div className="border-t border-white/10 bg-marrom-950 lg:hidden">
            <nav className="mx-auto flex max-w-6xl flex-col px-4 py-2 sm:px-6">
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuAberto(false)}
                  className="border-b border-white/5 py-3 text-sm font-medium text-marrom-100 last:border-0"
                >
                  {item.label}
                </a>
              ))}
              <Link
                to="/cardapio"
                className="my-3 rounded-xl bg-amber-400 px-4 py-3 text-center text-sm font-bold text-marrom-950"
              >
                Fazer pedido
              </Link>
            </nav>
          </div>
        )}
      </header>

      {/* ---------- Hero ---------- */}
      <section id="topo" className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_0%,rgba(251,191,36,0.16),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-marrom-950" />

        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="max-w-3xl"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
              <Flame className="h-3.5 w-3.5" />
              Churrasco todos os dias
            </span>

            <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-amber-50 sm:text-6xl">
              {siteInfo.tagline.split(",")[0]},
              <span className="block text-amber-400">{siteInfo.tagline.split(",").slice(1).join(",").trim()}</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-marrom-200">{siteInfo.descricaoCurta}</p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                to="/cardapio"
                className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-3.5 text-base font-bold text-marrom-950 shadow-lg shadow-amber-400/20 transition-colors hover:bg-amber-300"
              >
                Ver cardápio e pedir
                <ArrowRight className="h-5 w-5" />
              </Link>
              {temWhatsapp && (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-base font-semibold text-amber-50 transition-colors hover:bg-white/10"
                >
                  <MessageCircle className="h-5 w-5" />
                  Falar no WhatsApp
                </a>
              )}
            </div>

            <dl className="mt-14 grid gap-6 sm:grid-cols-3">
              {heroDestaques.map((item) => (
                <div key={item.titulo} className="border-l-2 border-amber-400/60 pl-4">
                  <dt className="text-sm font-bold text-amber-50">{item.titulo}</dt>
                  <dd className="mt-1 text-sm text-marrom-300">{item.detalhe}</dd>
                </div>
              ))}
            </dl>
          </motion.div>
        </div>
      </section>

      {/* ---------- Faixa do acompanhamento ---------- */}
      <div className="border-y border-amber-400/20 bg-amber-400/5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-4 text-center sm:px-6">
          <UtensilsCrossed className="h-4 w-4 text-amber-400" />
          <p className="text-sm text-marrom-100">
            Todo prato do dia acompanha{" "}
            <strong className="font-semibold text-amber-300">{acompanhamentoPadrao.toLowerCase()}</strong>
          </p>
        </div>
      </div>

      {/* ---------- Sobre ---------- */}
      <section id="sobre" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <motion.div {...reveal} className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div>
            <SectionTitle overline="A casa" title={sobre.titulo} />
            <div className="mt-6 space-y-5">
              {sobre.paragrafos.map((p) => (
                <p key={p.slice(0, 24)} className="text-base leading-relaxed text-marrom-200">
                  {p}
                </p>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {sobre.pilares.map((pilar) => (
              <div
                key={pilar.titulo}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-amber-400/40"
              >
                <ChefHat className="h-5 w-5 text-amber-400" />
                <h3 className="mt-3 text-base font-bold text-amber-50">{pilar.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-marrom-300">{pilar.texto}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ---------- Prato do dia ---------- */}
      <section id="cardapio" className="border-y border-white/10 bg-marrom-900/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <motion.div {...reveal}>
            <SectionTitle
              overline="Prato do dia"
              title="Cada dia da semana tem o seu"
              description={`Todos os pratos são servidos com ${acompanhamentoPadrao.toLowerCase()}. Escolha o dia para ver o cardápio completo.`}
            />

            <div className="mt-9 flex flex-wrap gap-2">
              {cardapioSemana.map((dia) => {
                const ativo = dia.chave === diaSelecionado;
                return (
                  <button
                    key={dia.chave}
                    type="button"
                    onClick={() => setDiaSelecionado(dia.chave)}
                    className={
                      "rounded-xl px-4 py-2.5 text-sm font-bold transition-colors " +
                      (ativo
                        ? "bg-amber-400 text-marrom-950"
                        : "border border-white/10 bg-white/[0.03] text-marrom-200 hover:border-amber-400/40 hover:text-amber-100")
                    }
                  >
                    <span className="sm:hidden">{dia.abreviacao}</span>
                    <span className="hidden sm:inline">{dia.dia.replace("-feira", "")}</span>
                    {dia.chave === hoje && (
                      <span className={"ml-2 text-[10px] uppercase " + (ativo ? "text-marrom-800" : "text-amber-400")}>
                        hoje
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-8 rounded-3xl border border-white/10 bg-marrom-950/60 p-5 sm:p-8">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-5">
                <h3 className="text-2xl font-extrabold text-amber-50">{diaAtivo.dia}</h3>
                <p className="text-sm text-marrom-300">{diaAtivo.pratos.length} opções no cardápio</p>
              </div>

              <ul className="mt-6 grid gap-x-12 gap-y-5 md:grid-cols-2">
                {diaAtivo.pratos.map((prato) => (
                  <li key={prato.nome} className="flex items-baseline gap-3">
                    <span className="font-semibold text-amber-100">
                      {prato.nome}
                      {prato.destaque && (
                        <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wider text-amber-400">
                          ★
                        </span>
                      )}
                    </span>
                    <span className="h-px flex-1 translate-y-[-2px] border-b border-dashed border-white/15" />
                    <span className="shrink-0 font-bold text-amber-400">{fmt(prato.preco)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-amber-400/10 px-5 py-4">
                <p className="text-sm text-amber-100">
                  Acompanha {acompanhamentoPadrao.toLowerCase()} — sem cobrança extra.
                </p>
                <Link
                  to="/cardapio"
                  className="inline-flex items-center gap-2 text-sm font-bold text-amber-400 hover:text-amber-300"
                >
                  Pedir agora
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---------- Especialidades ---------- */}
      <section id="especialidades" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <motion.div {...reveal}>
          <SectionTitle
            overline="Especialidades"
            title="O que a gente faz de melhor"
            description="Os clássicos que se repetem na semana e os pratos que têm dia certo para aparecer."
          />

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {especialidades.map((item) => (
              <article
                key={item.nome}
                className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-amber-400/40"
              >
                <div className="relative flex h-36 items-center justify-center bg-gradient-to-br from-marrom-800 via-marrom-900 to-marrom-950">
                  <Flame className="h-10 w-10 text-amber-400/70 transition-transform group-hover:scale-110" />
                  <span className="absolute left-4 top-4 rounded-full bg-marrom-950/80 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    {item.etiqueta}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-lg font-bold text-amber-50">{item.nome}</h3>
                    <span className="shrink-0 text-sm font-bold text-amber-400">{fmt(item.preco)}</span>
                  </div>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-marrom-300">{item.descricao}</p>
                </div>
              </article>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ---------- Ambiente ---------- */}
      <section id="ambiente" className="border-y border-white/10 bg-marrom-900/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <motion.div {...reveal}>
            <SectionTitle
              overline="O ambiente"
              title="Mesa grande, prato cheio e conversa alta"
              description="Um salão sem frescura, feito para quem tem uma hora de almoço e quer comer bem nela."
            />

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {galeria.map((foto, i) => (
                <figure
                  key={foto.legenda}
                  className={
                    "relative overflow-hidden rounded-2xl border border-white/10 " +
                    (i === 0 ? "sm:col-span-2 sm:row-span-2" : "")
                  }
                >
                  {foto.src ? (
                    <img
                      src={foto.src}
                      alt={foto.legenda}
                      loading="lazy"
                      className={"w-full object-cover " + (i === 0 ? "h-72 sm:h-full" : "h-48")}
                    />
                  ) : (
                    <div
                      className={
                        "flex items-center justify-center bg-gradient-to-br from-marrom-800 via-marrom-900 to-marrom-950 " +
                        (i === 0 ? "h-72 sm:h-full sm:min-h-[20rem]" : "h-48")
                      }
                    >
                      <UtensilsCrossed className="h-8 w-8 text-amber-400/40" />
                    </div>
                  )}
                  <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-marrom-950 to-transparent px-4 py-3 text-sm font-medium text-amber-50">
                    {foto.legenda}
                  </figcaption>
                </figure>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---------- Como funciona ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <motion.div {...reveal}>
          <SectionTitle overline="Como pedir" title="Do celular para a mesa em três passos" />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {comoFunciona.map((etapa) => (
              <div key={etapa.passo} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-400 text-base font-extrabold text-marrom-950">
                  {etapa.passo}
                </span>
                <h3 className="mt-4 text-lg font-bold text-amber-50">{etapa.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-marrom-300">{etapa.texto}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ---------- Visite / horários / mapa ---------- */}
      <section id="visite" className="border-y border-white/10 bg-marrom-900/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <motion.div {...reveal} className="grid gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <SectionTitle overline="Visite" title="Onde a gente fica" />

              <div className="mt-8 space-y-5">
                <div className="flex gap-4">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  <div>
                    <p className="font-semibold text-amber-50">{siteInfo.endereco.linha1}</p>
                    <p className="text-sm text-marrom-300">{siteInfo.endereco.linha2}</p>
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-amber-400 hover:text-amber-300"
                    >
                      Como chegar
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  <div className="w-full">
                    <p className="font-semibold text-amber-50">Horário de funcionamento</p>
                    <dl className="mt-2 space-y-1.5">
                      {horarios.map((h) => (
                        <div key={h.dia} className="flex items-baseline gap-3 text-sm">
                          <dt className="text-marrom-300">{h.dia}</dt>
                          <span className="h-px flex-1 translate-y-[-2px] border-b border-dashed border-white/10" />
                          <dd className="font-medium text-amber-100">{h.horario}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>

                {temWhatsapp && (
                  <div className="flex gap-4">
                    <Phone className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                    <div>
                      <p className="font-semibold text-amber-50">{siteInfo.whatsapp.exibicao}</p>
                      <a
                        href={whatsappHref}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-marrom-300 hover:text-amber-300"
                      >
                        Chamar no WhatsApp
                      </a>
                    </div>
                  </div>
                )}

                <div className="flex gap-4">
                  <Truck className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  <div>
                    <p className="font-semibold text-amber-50">Entrega e retirada</p>
                    <p className="text-sm text-marrom-300">
                      Retirada sem frete no balcão. Entrega com valor calculado pela distância, informado antes de você
                      fechar o pedido.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-white/10">
              <iframe
                title={`Mapa — ${siteInfo.nome}`}
                src={mapsEmbed}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-80 w-full lg:h-full lg:min-h-[26rem]"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
        <motion.div {...reveal}>
          <SectionTitle overline="Dúvidas" title="Perguntas que a gente ouve todo dia" />
          <Accordion type="single" collapsible className="mt-8">
            {faq.map((item) => (
              <AccordionItem key={item.pergunta} value={item.pergunta} className="border-white/10">
                <AccordionTrigger className="text-left text-base font-semibold text-amber-50 hover:text-amber-300 hover:no-underline">
                  {item.pergunta}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-marrom-300">
                  {item.resposta}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </section>

      {/* ---------- CTA final ---------- */}
      <section className="px-4 pb-20 sm:px-6">
        <motion.div
          {...reveal}
          className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-amber-400/25 bg-gradient-to-br from-marrom-800 via-marrom-900 to-marrom-950 px-6 py-14 text-center sm:px-12"
        >
          <Flame className="mx-auto h-8 w-8 text-amber-400" />
          <h2 className="mt-5 text-3xl font-extrabold text-amber-50 sm:text-4xl">Está com fome agora?</h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-marrom-200">
            O cardápio de hoje já está no ar. Monte seu pedido em um minuto e escolha entre retirar no balcão ou receber
            em casa.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/cardapio"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-3.5 text-base font-bold text-marrom-950 transition-colors hover:bg-amber-300"
            >
              Ver cardápio de hoje
              <ArrowRight className="h-5 w-5" />
            </Link>
            {temWhatsapp && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-base font-semibold text-amber-50 transition-colors hover:bg-white/10"
              >
                <MessageCircle className="h-5 w-5" />
                {siteInfo.whatsapp.exibicao}
              </a>
            )}
          </div>
        </motion.div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-white/10 bg-marrom-950">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt={siteInfo.nome} className="h-10 w-10 object-contain" />
                <span className="text-lg font-extrabold text-amber-50">{siteInfo.nome}</span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-marrom-300">{siteInfo.descricaoCurta}</p>
            </div>

            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400">Navegue</h3>
              <ul className="mt-4 space-y-2 text-sm">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <a href={item.href} className="text-marrom-300 hover:text-amber-300">
                      {item.label}
                    </a>
                  </li>
                ))}
                <li>
                  <Link to="/cardapio" className="text-marrom-300 hover:text-amber-300">
                    Cardápio digital
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400">Contato</h3>
              <ul className="mt-4 space-y-3 text-sm">
                {temWhatsapp && (
                  <li>
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-marrom-300 hover:text-amber-300"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {siteInfo.whatsapp.exibicao}
                    </a>
                  </li>
                )}
                {temEmail && (
                  <li>
                    <a
                      href={`mailto:${siteInfo.email}`}
                      className="flex items-center gap-2 text-marrom-300 hover:text-amber-300"
                    >
                      <Mail className="h-4 w-4" />
                      {siteInfo.email}
                    </a>
                  </li>
                )}
                {temInstagram && (
                  <li>
                    <a
                      href={siteInfo.instagram.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-marrom-300 hover:text-amber-300"
                    >
                      <Instagram className="h-4 w-4" />
                      {siteInfo.instagram.usuario}
                    </a>
                  </li>
                )}
                <li>
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-2 text-marrom-300 hover:text-amber-300"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {siteInfo.endereco.linha1}
                      <br />
                      {siteInfo.endereco.linha2}
                    </span>
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-marrom-400 sm:flex-row">
            <p>
              © {new Date().getFullYear()} {siteInfo.nome}. Todos os direitos reservados.
            </p>
            <Link to="/login" className="hover:text-amber-300">
              Acesso da equipe
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
