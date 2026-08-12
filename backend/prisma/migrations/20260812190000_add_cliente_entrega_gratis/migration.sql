-- AlterTable: isencao de frete individual por cliente (entrega gratis)
ALTER TABLE "clientes" ADD COLUMN "entregaGratis" BOOLEAN NOT NULL DEFAULT false;
