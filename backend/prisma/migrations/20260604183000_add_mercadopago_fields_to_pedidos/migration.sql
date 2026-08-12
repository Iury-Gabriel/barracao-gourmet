ALTER TABLE "pedidos"
ADD COLUMN "mercadoPagoOrderId" TEXT,
ADD COLUMN "mercadoPagoPaymentId" TEXT,
ADD COLUMN "mercadoPagoStatus" TEXT,
ADD COLUMN "mercadoPagoStatusDetail" TEXT,
ADD COLUMN "mercadoPagoQrCode" TEXT,
ADD COLUMN "mercadoPagoQrCodeImageUrl" TEXT,
ADD COLUMN "mercadoPagoTicketUrl" TEXT,
ADD COLUMN "mercadoPagoExpirationDate" TEXT;
