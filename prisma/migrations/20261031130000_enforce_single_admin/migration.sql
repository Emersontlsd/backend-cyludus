-- Garante que exista somente um administrador cadastrado na plataforma.
-- A restrição inclui administradores ativos e inativos.

CREATE UNIQUE INDEX "User_only_one_admin_key"
ON "User" ("role")
WHERE "role" = 'ADMIN';