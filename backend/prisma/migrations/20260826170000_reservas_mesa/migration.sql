-- CreateTable
CREATE TABLE "reservas" (
    "id" TEXT NOT NULL,
    "nomeCliente" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "pessoas" INTEGER NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "observacoes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "origem" TEXT NOT NULL DEFAULT 'WHATSAPP_IA',
    "clienteId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservas_dataHora_idx" ON "reservas"("dataHora");

-- CreateIndex
CREATE INDEX "reservas_status_idx" ON "reservas"("status");

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
