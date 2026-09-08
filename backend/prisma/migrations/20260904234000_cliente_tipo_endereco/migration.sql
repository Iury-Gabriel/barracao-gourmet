-- Tipo do endereco do cliente.
--
-- Empresa recebe em horario comercial e costuma ter portaria; casa nao. Quem
-- entrega precisa saber disso antes de sair.

ALTER TABLE "clientes" ADD COLUMN "tipoEndereco" TEXT NOT NULL DEFAULT 'RESIDENCIAL';
