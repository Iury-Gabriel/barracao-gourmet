-- AlterTable
ALTER TABLE "cupons" ADD COLUMN     "tiposPedido" TEXT[] DEFAULT ARRAY[]::TEXT[];
