# Barracão Gourmet - Agente de Impressão

App que fica rodando na loja (Windows) monitorando pedidos novos do cardápio digital
e imprimindo automaticamente na impressora térmica (Epson TM-T20X ou compatível).

## Instalação (loja)

### 1. Instalar o driver da impressora no Windows

1. Baixe o driver "APD" (Advanced Printer Driver) da Epson para o TM-T20X na página
   oficial de suporte (aba de Downloads/Drivers):
   https://epson.com.br/Suporte/Ponto-de-venda/Impressoras-de-recibos/Epson-TM-T20X/s/SPT_C31CH26031
2. Conecte a impressora via USB no computador.
3. Instale o driver seguindo o instalador da Epson. Depois de instalado, ela deve
   aparecer em **Configurações > Impressoras e scanners** do Windows, geralmente
   como algo como `EPSON TM-T20X Receipt`.
4. Anote o nome exato que aparece ali — vai ser usado na configuração do agente.
5. Recomendado: nas propriedades da impressora, defina o tamanho do papel como
   "80mm x Receipt/Contínuo" (ou o equivalente do driver) e ative o corte automático,
   se disponível.

### 2. Instalar o agente

1. Rode o instalador `Barracão Gourmet - Impressora Setup 1.0.0.exe`.
2. Na primeira abertura, a janela de configuração abre sozinha. Preencha:
   - **URL do servidor**: `https://api.barracaogourmet.com.br`
   - **E-mail**: `impressora@barracaogourmet.local`
   - **Senha**: `vN2nUevuhU9Y3zmS`
   - **Impressora**: selecione na lista (clique em ↻ se não aparecer de primeira).
   - **Iniciar automaticamente com o Windows**: deixe marcado.
3. Clique em **Testar conexão**, depois **Testar login**, depois **Imprimir teste**
   — os três devem funcionar antes de salvar de vez.
4. Clique em **Salvar configurações**.

Pronto — o app fica rodando na bandeja do Windows (ícone perto do relógio) e
verifica pedidos novos automaticamente. Fechar a janela apenas a esconde; para
encerrar de vez, clique com o botão direito no ícone da bandeja e escolha **Sair**.

## Desenvolvimento

```bash
npm install
npm start          # roda o app em modo dev
npm run dist        # gera o instalador .exe em dist/
```

## Como funciona

- A cada poucos segundos, o agente consulta `GET /api/pedidos/para-imprimir` no
  backend (pedidos com `impresso = false`).
- Para cada pedido novo, monta um cupom em PDF (formatado pro papel térmico) e
  manda pra impressora usando o driver já instalado no Windows.
- Depois de imprimir com sucesso, marca o pedido como impresso via
  `PATCH /api/pedidos/:id/marcar-impresso`, pra não imprimir de novo.
- Se a impressão falhar (impressora sem papel, desligada, etc.), o pedido
  **não** é marcado como impresso — o agente tenta de novo na próxima checagem.
