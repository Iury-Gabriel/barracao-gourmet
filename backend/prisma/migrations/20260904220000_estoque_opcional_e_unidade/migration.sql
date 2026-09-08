-- Estoque deixa de ser obrigatorio para todo produto.
--
-- A casa vende marmita e prato do dia, feitos na hora, que nao tem quantidade
-- para controlar. Como o cardapio e as tools da IA filtravam por estoque > 0,
-- esses itens sumiam da venda assim que o estoque zerava.
--
-- controlaEstoque = false: item infinito (nao some, nao alerta, nao da baixa).
-- vendavel = false: insumo, aparece no estoque mas nao no cardapio.
-- unidade: UN conta unidades, KG controla por peso.
-- estoque vira double precision para aceitar fracao (2.5 kg).

ALTER TABLE "produtos" ADD COLUMN "unidade" TEXT NOT NULL DEFAULT 'UN';
ALTER TABLE "produtos" ADD COLUMN "controlaEstoque" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "produtos" ADD COLUMN "vendavel" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "produtos" ALTER COLUMN "estoque" SET DATA TYPE DOUBLE PRECISION;
ALTER TABLE "produtos" ALTER COLUMN "estoqueMinimo" SET DATA TYPE DOUBLE PRECISION;

ALTER TABLE "produto_variacoes" ALTER COLUMN "estoque" SET DATA TYPE DOUBLE PRECISION;
ALTER TABLE "produto_variacoes" ALTER COLUMN "estoqueMinimo" SET DATA TYPE DOUBLE PRECISION;
