-- Preco adicional por variacao.
--
-- A casa cadastra "mais 100g de parmegiana por R$ 9,00" como variacao, mas a
-- variacao so tinha nome e descricao: o valor ficava escrito no texto e nunca
-- era cobrado. Zero mantem o comportamento atual (variacao sem custo).
ALTER TABLE "produto_variacoes" ADD COLUMN "precoAdicional" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Produto novo passa a nascer sem controle de estoque. Com o padrao ligado,
-- todo prato cadastrado sem informar quantidade nascia com saldo zero e
-- aparecia esgotado no cardapio (foi o que aconteceu com os pratos do dia).
ALTER TABLE "produtos" ALTER COLUMN "controlaEstoque" SET DEFAULT false;

-- Conserta os pratos ja cadastrados assim: sem estoque, sem controle e ainda
-- sem nenhuma venda registrada, e prato feito na hora, nao item que acabou.
UPDATE "produtos" p
SET "controlaEstoque" = false
WHERE p."controlaEstoque" = true
  AND p."estoque" <= 0
  AND p."vendavel" = true
  AND NOT EXISTS (SELECT 1 FROM "movimentacoes_estoque" m WHERE m."produtoId" = p."id");
