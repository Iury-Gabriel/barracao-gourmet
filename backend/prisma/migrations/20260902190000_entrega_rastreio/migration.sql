-- AlterTable
ALTER TABLE "entregadores" ADD COLUMN "usuarioId" TEXT;

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN "entregadorId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "entregadores_usuarioId_key" ON "entregadores"("usuarioId");

-- CreateIndex
CREATE INDEX "pedidos_entregadorId_idx" ON "pedidos"("entregadorId");

-- AddForeignKey
ALTER TABLE "entregadores" ADD CONSTRAINT "entregadores_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_entregadorId_fkey" FOREIGN KEY ("entregadorId") REFERENCES "entregadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
