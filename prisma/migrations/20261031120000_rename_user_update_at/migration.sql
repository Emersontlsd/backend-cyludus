-- Renomeia a coluna de atualização do usuário.
-- Preserva todos os registros e valores existentes.

ALTER TABLE "User"
RENAME COLUMN "updateAt" TO "updatedAt";