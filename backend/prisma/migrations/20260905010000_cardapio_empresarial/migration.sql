-- Cardapio empresarial.
--
-- Empresa conveniada entra com email e senha e ve o proprio cardapio: pode ter
-- item exclusivo (marmita em quantidade fechada) e preco diferente do varejo.
--
-- Cliente comum nao e afetado: sem senha definida nao existe login, e produto
-- sem precoEmpresa continua com o preco de sempre.

ALTER TABLE "clientes" ADD COLUMN "senhaHash" TEXT;
ALTER TABLE "produtos" ADD COLUMN "precoEmpresa" DOUBLE PRECISION;
ALTER TABLE "produtos" ADD COLUMN "exclusivoEmpresa" BOOLEAN NOT NULL DEFAULT false;
