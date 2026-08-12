-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "cupomId" TEXT,
ADD COLUMN     "cupomCodigo" TEXT,
ADD COLUMN     "descontoCupom" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "cupons" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "valorMinimoPedido" DOUBLE PRECISION,
    "descontoMaximo" DOUBLE PRECISION,
    "limiteUsos" INTEGER,
    "usosCount" INTEGER NOT NULL DEFAULT 0,
    "limitePorCliente" INTEGER,
    "diasSemana" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cupons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cupons_codigo_key" ON "cupons"("codigo");

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cupomId_fkey" FOREIGN KEY ("cupomId") REFERENCES "cupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
