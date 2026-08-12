ALTER TABLE "produtos"
ADD COLUMN "controlaEstoquePorVariacao" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "produto_variacoes"
ADD COLUMN "estoque" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "estoqueMinimo" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "movimentacoes_estoque"
ADD COLUMN "variacaoNome" TEXT;
