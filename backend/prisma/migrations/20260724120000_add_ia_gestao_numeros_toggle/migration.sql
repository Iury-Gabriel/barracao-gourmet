-- AlterTable: liga/desliga global do agente
ALTER TABLE "configuracao_ia" ADD COLUMN "iaAtiva" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: numeros atendidos pelo agente de gestao na instancia unica
CREATE TABLE "numeros_gestao" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "nome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "numeros_gestao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "numeros_gestao_numero_key" ON "numeros_gestao"("numero");
