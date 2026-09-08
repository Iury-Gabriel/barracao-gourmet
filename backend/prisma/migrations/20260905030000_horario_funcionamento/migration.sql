-- Horario de funcionamento da loja.
--
-- Ate aqui so existia o botao manual de "loja fechada". Se ninguem lembrasse de
-- apertar, o cardapio aceitava pedido de madrugada ou no domingo, e a casa
-- ficava com pedido que nao tem como cumprir.
--
-- O fechamento manual continua existindo e vale por cima do horario, para
-- imprevisto (falta de gas, feriado).

ALTER TABLE "configuracao_loja" ADD COLUMN "horaAbertura" TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE "configuracao_loja" ADD COLUMN "horaFechamento" TEXT NOT NULL DEFAULT '15:00';
ALTER TABLE "configuracao_loja" ADD COLUMN "diasFuncionamento" INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6];
