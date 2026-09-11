-- Conexao do Mercado Pago via OAuth ("Conectar Mercado Pago"): guarda o token da
-- conta conectada e o refresh para renovar sozinho. Sem conexao, o sistema segue
-- usando o MERCADO_PAGO_ACCESS_TOKEN do .env.
ALTER TABLE "configuracao_loja" ADD COLUMN IF NOT EXISTS "mercadoPagoAccessToken" TEXT;
ALTER TABLE "configuracao_loja" ADD COLUMN IF NOT EXISTS "mercadoPagoRefreshToken" TEXT;
ALTER TABLE "configuracao_loja" ADD COLUMN IF NOT EXISTS "mercadoPagoUserId" TEXT;
ALTER TABLE "configuracao_loja" ADD COLUMN IF NOT EXISTS "mercadoPagoPublicKey" TEXT;
ALTER TABLE "configuracao_loja" ADD COLUMN IF NOT EXISTS "mercadoPagoTokenExpiraEm" TIMESTAMP(3);
