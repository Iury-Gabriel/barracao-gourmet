-- CreateTable
CREATE TABLE "configuracao_loja" (
    "id" TEXT NOT NULL,
    "lojaFechada" BOOLEAN NOT NULL DEFAULT false,
    "mensagemFechado" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracao_loja_pkey" PRIMARY KEY ("id")
);
