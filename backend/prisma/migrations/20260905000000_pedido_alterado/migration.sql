-- Marca de alteracao do pedido.
--
-- O cliente pode mudar o pedido dentro de uma janela curta depois de enviar.
-- Quando isso acontece a cozinha ja pode ter o papel antigo na mao, entao o
-- cupom reimpresso precisa avisar que aquilo mudou.

ALTER TABLE "pedidos" ADD COLUMN "alteradoEm" TIMESTAMP(3);
