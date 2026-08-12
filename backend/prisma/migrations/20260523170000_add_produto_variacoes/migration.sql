-- AlterTable
ALTER TABLE "produtos"
ADD COLUMN "tipoVariacao" TEXT;

-- CreateTable
CREATE TABLE "produto_variacoes" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produto_variacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "produto_variacoes_produtoId_ordem_idx" ON "produto_variacoes"("produtoId", "ordem");

-- AddForeignKey
ALTER TABLE "produto_variacoes"
ADD CONSTRAINT "produto_variacoes_produtoId_fkey"
FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;