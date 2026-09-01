/**
 * Conteúdo da landing page institucional (/site).
 *
 * Este arquivo concentra TODO o texto, preço, horário e contato do site público.
 * Para atualizar o site, edite só aqui — nenhum componente precisa ser tocado.
 *
 * ⚠️ Os campos marcados com "CONFIRMAR" estão preenchidos com valores herdados do
 *    backend (`backend/src/config/env.ts`) ou de exemplo. Revise antes de publicar.
 *    Os pratos e preços vieram dos encartes oficiais do "Prato do Dia".
 */

export const siteInfo = {
  nome: "Barracão Gourmet",
  tagline: "Comida caseira de verdade, feita na hora",
  descricaoCurta:
    "Prato do dia com arroz, feijão, batata, legumes e farofa — e churrasco todos os dias. Almoce no salão, retire no balcão ou receba em casa.",
  // CONFIRMAR: endereço herdado de LOJA_ENDERECO_RETIRADA / LOJA_ENDERECO_BASE.
  endereco: {
    linha1: "Rua Dino Borgioli, 536 A",
    linha2: "Vila Campo Grande — São Paulo/SP",
    // Usado no mapa e no botão "Como chegar".
    buscaMaps: "Rua Dino Borgioli, 536, Vila Campo Grande, São Paulo, SP, Brasil",
  },
  // CONFIRMAR: telefone/WhatsApp reais. Formato do link: só dígitos, com DDI 55.
  whatsapp: {
    numero: "5511999999999",
    exibicao: "(11) 99999-9999",
    mensagem: "Olá! Vim pelo site e gostaria de fazer um pedido.",
  },
  email: "contato@barracaogourmet.com.br",
  instagram: {
    usuario: "@barracaogourmet",
    url: "https://instagram.com/barracaogourmet",
  },
};

/** Acompanhamento padrão de todos os pratos do dia (vem impresso em todo o encarte). */
export const acompanhamentoPadrao = "Arroz, feijão, batata, legumes e farofa";

/** Aparece logo abaixo do título do hero, como prova rápida. */
export const heroDestaques = [
  { titulo: "Churrasco todos os dias", detalhe: "Na brasa, de segunda a sábado" },
  { titulo: "Prato feito na hora", detalhe: "Com acompanhamento completo" },
  { titulo: "Entrega e retirada", detalhe: "Frete calculado por distância" },
];

/** Seção "Nossa casa" — o texto que apresenta o restaurante. */
export const sobre = {
  titulo: "Um barracão, um fogão e muita comida boa",
  paragrafos: [
    "O Barracão Gourmet é aquele restaurante de bairro que você procura na hora do almoço: prato do dia servido no capricho, panela no fogo desde cedo e a brasa acesa todo santo dia.",
    "Cada prato sai com arroz, feijão, batata, legumes e farofa — o acompanhamento completo, sem cobrar à parte. E o cardápio muda a cada dia da semana: tem feijoada, virado à paulista, dobradinha, rabada, peixe na sexta e churrasco sempre.",
    "Você almoça aqui no salão, leva para viagem ou recebe em casa pelo cardápio digital. O jeito muda, o tempero não.",
  ],
  pilares: [
    {
      titulo: "Acompanhamento completo",
      texto: "Arroz, feijão, batata, legumes e farofa em todos os pratos, sem custo extra.",
    },
    {
      titulo: "Churrasco todo dia",
      texto: "A brasa não descansa: churrasco disponível de segunda a sábado.",
    },
    {
      titulo: "Cardápio que muda",
      texto: "Cada dia tem seu prato do dia, dos clássicos aos de panela como mocotó e rabada.",
    },
    {
      titulo: "Preço de bairro",
      texto: "Prato honesto a partir de R$ 20,00, do jeito que trabalhador precisa.",
    },
  ],
};

export type PratoDoDia = { nome: string; preco: number; destaque?: boolean };

/**
 * Cardápio "Prato do Dia" por dia da semana — transcrito dos encartes oficiais.
 * Todos acompanham `acompanhamentoPadrao`.
 * `chave` bate com Date#getDay() (0 = domingo) para destacar o dia atual.
 */
export const cardapioSemana: {
  chave: number;
  dia: string;
  abreviacao: string;
  pratos: PratoDoDia[];
}[] = [
  {
    chave: 1,
    dia: "Segunda-feira",
    abreviacao: "Seg",
    pratos: [
      { nome: "Frango assado", preco: 20 },
      { nome: "Linguiça", preco: 20 },
      { nome: "Bisteca", preco: 22 },
      { nome: "Calabresa", preco: 22 },
      { nome: "Filé de frango", preco: 22 },
      { nome: "Omelete", preco: 24 },
      { nome: "Picadinho", preco: 24 },
      { nome: "Churrasco", preco: 27, destaque: true },
      { nome: "Virado à paulista", preco: 27, destaque: true },
      { nome: "Parmegiana de frango", preco: 27 },
      { nome: "Filé de frango à milanesa", preco: 27 },
      { nome: "Contra com fritas", preco: 30 },
    ],
  },
  {
    chave: 2,
    dia: "Terça-feira",
    abreviacao: "Ter",
    pratos: [
      { nome: "Frango assado", preco: 20 },
      { nome: "Linguiça", preco: 20 },
      { nome: "Dobradinha", preco: 22, destaque: true },
      { nome: "Strogonoff", preco: 22 },
      { nome: "Panqueca", preco: 22 },
      { nome: "Filé de frango", preco: 22 },
      { nome: "Pernil assado", preco: 22 },
      { nome: "Omelete", preco: 24 },
      { nome: "Costelinha", preco: 25 },
      { nome: "Churrasco", preco: 27, destaque: true },
      { nome: "Parmegiana de frango", preco: 27 },
      { nome: "Contra com fritas", preco: 30 },
    ],
  },
  {
    chave: 3,
    dia: "Quarta-feira",
    abreviacao: "Qua",
    pratos: [
      { nome: "Frango assado", preco: 20 },
      { nome: "Galinha com quiabo", preco: 20, destaque: true },
      { nome: "Almôndegas", preco: 22 },
      { nome: "Bisteca", preco: 22 },
      { nome: "Filé de frango", preco: 22 },
      { nome: "Pernil assado", preco: 22 },
      { nome: "Omelete", preco: 24 },
      { nome: "Churrasco", preco: 27, destaque: true },
      { nome: "Frango à milanesa", preco: 27 },
      { nome: "Parmegiana de frango", preco: 27 },
      { nome: "Feijoada (tudo junto)", preco: 27, destaque: true },
      { nome: "Feijoada (separada)", preco: 40 },
    ],
  },
  {
    chave: 4,
    dia: "Quinta-feira",
    abreviacao: "Qui",
    pratos: [
      { nome: "Frango assado", preco: 20 },
      { nome: "Linguiça assada", preco: 20 },
      { nome: "Mocotó", preco: 22, destaque: true },
      { nome: "Fígado acebolado", preco: 22 },
      { nome: "Filé de frango", preco: 22 },
      { nome: "Pernil assado", preco: 22 },
      { nome: "Omelete", preco: 24 },
      { nome: "Lasanha", preco: 24, destaque: true },
      { nome: "Costela", preco: 24 },
      { nome: "Cupim ao molho", preco: 25 },
      { nome: "Churrasco", preco: 27, destaque: true },
      { nome: "Parmegiana de frango", preco: 27 },
      { nome: "Frango à milanesa", preco: 27 },
      { nome: "Bife com fritas", preco: 30 },
    ],
  },
  {
    chave: 5,
    dia: "Sexta-feira",
    abreviacao: "Sex",
    pratos: [
      { nome: "Frango assado", preco: 20 },
      { nome: "Linguiça", preco: 20 },
      { nome: "Sarapatel", preco: 22, destaque: true },
      { nome: "Calabresa", preco: 22 },
      { nome: "Filé de frango", preco: 22 },
      { nome: "Pernil assado", preco: 22 },
      { nome: "Omelete", preco: 24 },
      { nome: "Peixe frito", preco: 24, destaque: true },
      { nome: "Rabada", preco: 25, destaque: true },
      { nome: "Peixe ao molho", preco: 27 },
      { nome: "Churrasco", preco: 27, destaque: true },
      { nome: "Parmegiana de frango", preco: 27 },
      { nome: "Frango à milanesa", preco: 27 },
      { nome: "Bife com fritas", preco: 30 },
    ],
  },
  {
    chave: 6,
    dia: "Sábado",
    abreviacao: "Sáb",
    pratos: [
      { nome: "Frango assado", preco: 20 },
      { nome: "Galinha com quiabo", preco: 20, destaque: true },
      { nome: "Almôndegas", preco: 22 },
      { nome: "Bisteca", preco: 22 },
      { nome: "Filé de frango", preco: 22 },
      { nome: "Pernil assado", preco: 22 },
      { nome: "Omelete", preco: 24 },
      { nome: "Lasanha", preco: 24 },
      { nome: "Churrasco", preco: 27, destaque: true },
      { nome: "Frango à parmegiana", preco: 27 },
      { nome: "Frango à milanesa", preco: 27 },
      { nome: "Feijoada (tudo junto)", preco: 27, destaque: true },
      { nome: "Feijoada (separada)", preco: 40 },
    ],
  },
];

/** Os clássicos que aparecem em quase todo dia da semana — vitrine do topo. */
export const especialidades = [
  {
    nome: "Churrasco",
    descricao:
      "A brasa fica acesa de segunda a sábado. Corte no ponto, servido com o acompanhamento completo.",
    preco: 27,
    etiqueta: "Todos os dias",
  },
  {
    nome: "Feijoada",
    descricao:
      "Quarta e sábado, na panela desde cedo. Tudo junto no prato ou servida separada para montar do seu jeito.",
    preco: 27,
    etiqueta: "Quarta e sábado",
  },
  {
    nome: "Frango assado",
    descricao:
      "O mais pedido da casa, e o mais em conta: dourado por fora, suculento por dentro, todo dia no balcão.",
    preco: 20,
    etiqueta: "Mais pedido",
  },
  {
    nome: "Pratos de panela",
    descricao:
      "Mocotó na quinta, dobradinha na terça, rabada e sarapatel na sexta. Comida de raiz, feita devagar.",
    preco: 22,
    etiqueta: "Comida de raiz",
  },
  {
    nome: "Bife com fritas",
    descricao:
      "Contrafilé na chapa com fritas crocantes — o prato mais generoso do cardápio.",
    preco: 30,
    etiqueta: "Para quem chega com fome",
  },
  {
    nome: "Peixe na sexta",
    descricao:
      "Frito ou ao molho, para quem mantém a tradição da sexta-feira à mesa.",
    preco: 24,
    etiqueta: "Sexta-feira",
  },
];

/**
 * Galeria do ambiente. Deixe `src` vazio para exibir o cartão gráfico da marca;
 * ao apontar para uma foto em /public a imagem entra no lugar automaticamente.
 */
export const galeria = [
  { src: "", legenda: "O salão na hora do almoço" },
  { src: "", legenda: "A brasa do churrasco" },
  { src: "", legenda: "O quadro do prato do dia" },
  { src: "", legenda: "Mesa posta para dividir" },
  { src: "", legenda: "Marmitas prontas para viagem" },
];

/** Como o cliente pede — reflete o fluxo real do cardápio digital. */
export const comoFunciona = [
  {
    passo: "1",
    titulo: "Escolha no cardápio digital",
    texto: "Monte o pedido pelo celular, sem instalar nada e sem criar conta.",
  },
  {
    passo: "2",
    titulo: "Pague como preferir",
    texto: "Pix na hora, cartão pelo site ou pagamento na entrega, em dinheiro ou maquininha.",
  },
  {
    passo: "3",
    titulo: "Retire ou receba",
    texto: "Retirada no balcão sem frete, ou entrega na sua porta com o valor calculado pela distância.",
  },
];

/** CONFIRMAR: horários reais de funcionamento. */
export const horarios = [
  { dia: "Segunda a sexta", horario: "11h00 — 15h00" },
  { dia: "Sábado", horario: "11h00 — 16h00" },
  { dia: "Domingo", horario: "Fechado" },
  { dia: "Feriados", horario: "Consulte pelo WhatsApp" },
];

export const faq = [
  {
    pergunta: "O acompanhamento vem junto ou é cobrado à parte?",
    resposta:
      "Vem junto. Todo prato do dia é servido com arroz, feijão, batata, legumes e farofa pelo preço que está no cardápio.",
  },
  {
    pergunta: "Tem churrasco todo dia mesmo?",
    resposta:
      "Tem. O churrasco está no cardápio de segunda a sábado, sempre com o acompanhamento completo.",
  },
  {
    pergunta: "Vocês entregam na minha região?",
    resposta:
      "A entrega é calculada pela distância até a loja, direto no cardápio digital. Basta informar o endereço no fim do pedido: o site mostra o valor do frete ou avisa se o endereço está fora da área atendida.",
  },
  {
    pergunta: "Dá para retirar no balcão?",
    resposta:
      "Dá, e sai sem frete. Escolha a opção de retirada no pedido e a gente avisa quando estiver pronto para buscar.",
  },
  {
    pergunta: "Quais formas de pagamento vocês aceitam?",
    resposta:
      "Pix, cartão de crédito e débito pelo próprio site, e também pagamento na entrega em dinheiro ou maquininha.",
  },
  {
    pergunta: "Fazem encomenda para festa ou empresa?",
    resposta:
      "Fazemos, sob combinação. Chame no WhatsApp com a data, a quantidade de pessoas e o que você tem em mente que a gente monta o orçamento.",
  },
];
