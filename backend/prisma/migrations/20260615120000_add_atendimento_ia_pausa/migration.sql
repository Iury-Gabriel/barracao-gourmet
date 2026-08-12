-- CreateTable
CREATE TABLE "atendimentos_ia" (
    "id" TEXT NOT NULL,
    "instanciaId" TEXT NOT NULL,
    "remetente" TEXT NOT NULL,
    "iaPausada" BOOLEAN NOT NULL DEFAULT false,
    "pausadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "atendimentos_ia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "atendimentos_ia_instanciaId_remetente_key" ON "atendimentos_ia"("instanciaId", "remetente");
