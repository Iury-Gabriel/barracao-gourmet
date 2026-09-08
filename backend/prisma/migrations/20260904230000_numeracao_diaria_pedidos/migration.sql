-- Numeracao dos pedidos reinicia a cada dia.
--
-- O numero era unico na tabela inteira, entao o #1 de amanha colidiria com o
-- de hoje. Passa a ser unico por dia, com o dia gravado junto no pedido.
--
-- O corte do dia usa o fuso da casa, nao o UTC do servidor: em UTC a virada
-- cairia as 21h, no meio do expediente.

ALTER TABLE "contadores" ADD COLUMN "dia" TEXT NOT NULL DEFAULT '';
ALTER TABLE "pedidos" ADD COLUMN "diaNumero" TEXT NOT NULL DEFAULT '';

-- Pedidos existentes ficam com o dia em que foram criados. Como os numeros
-- eram unicos globalmente, o par (numero, dia) tambem nasce unico.
UPDATE "pedidos"
SET "diaNumero" = to_char("criadoEm" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD');

DROP INDEX IF EXISTS "pedidos_numero_key";
CREATE UNIQUE INDEX "pedidos_numero_diaNumero_key" ON "pedidos"("numero", "diaNumero");

-- Alinha o contador com o que ja saiu hoje, senao o proximo pedido do dia
-- repetiria um numero existente.
UPDATE "contadores"
SET "dia" = to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD'),
    "valor" = COALESCE((
      SELECT MAX("numero") FROM "pedidos"
      WHERE "diaNumero" = to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
    ), 0)
WHERE "id" = 'pedido_numero';
