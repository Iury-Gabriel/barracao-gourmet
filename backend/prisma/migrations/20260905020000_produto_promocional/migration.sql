-- Marca de promocao do produto.
--
-- A casa queria diferenciar na vitrine a marmita promocional da comum. E so
-- destaque visual: o preco cobrado continua sendo o do campo preco.

ALTER TABLE "produtos" ADD COLUMN "promocional" BOOLEAN NOT NULL DEFAULT false;
