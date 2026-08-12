-- AlterTable
ALTER TABLE "atendimentos_ia" ADD COLUMN "saudacaoEnviadaEm" TIMESTAMP(3);

-- Backfill obrigatorio: sem isso, todo contato que ja conversava com a IA antes deste deploy
-- seria tratado como "primeira mensagem" e receberia a saudacao de boas-vindas no meio de uma
-- conversa em andamento, com a mensagem real dele sendo descartada naquele turno.

-- 1) Contatos que ja tem linha em atendimentos_ia (foram pausados alguma vez).
UPDATE "atendimentos_ia" a
SET "saudacaoEnviadaEm" = COALESCE(
  (
    SELECT MIN(m."criadoEm")
    FROM "mensagens_ia" m
    WHERE m."instanciaId" = a."instanciaId" AND m."remetente" = a."remetente"
  ),
  a."criadoEm"
)
WHERE a."saudacaoEnviadaEm" IS NULL;

-- 2) Contatos com historico em mensagens_ia que ainda nao tem linha em atendimentos_ia
--    (a tabela so nascia quando alguem pausava a IA, entao e a maioria dos contatos antigos).
INSERT INTO "atendimentos_ia" ("id", "instanciaId", "remetente", "iaPausada", "saudacaoEnviadaEm", "criadoEm", "atualizadoEm")
SELECT
  gen_random_uuid()::text,
  m."instanciaId",
  m."remetente",
  false,
  MIN(m."criadoEm"),
  NOW(),
  NOW()
FROM "mensagens_ia" m
GROUP BY m."instanciaId", m."remetente"
ON CONFLICT ("instanciaId", "remetente") DO NOTHING;
