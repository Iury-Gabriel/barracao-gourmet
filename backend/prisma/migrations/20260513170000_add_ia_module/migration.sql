-- CreateTable
CREATE TABLE "configuracao_ia" (
    "id" TEXT NOT NULL,
    "openaiApiKey" TEXT,
    "openaiModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "uzapiUrl" TEXT,
    "uzapiAdminToken" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracao_ia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instancias_whatsapp" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "provedor" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DESCONECTADO',
    "uzapiUrl" TEXT,
    "uzapiToken" TEXT,
    "uzapiInstanceId" TEXT,
    "metaAccessToken" TEXT,
    "metaPhoneNumberId" TEXT,
    "metaWabaId" TEXT,
    "telefone" TEXT,
    "qrCode" TEXT,
    "webhookUrl" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instancias_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_ia" (
    "id" TEXT NOT NULL,
    "instanciaId" TEXT NOT NULL,
    "remetente" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "resposta" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'TEXTO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_ia_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "mensagens_ia" ADD CONSTRAINT "mensagens_ia_instanciaId_fkey" FOREIGN KEY ("instanciaId") REFERENCES "instancias_whatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
