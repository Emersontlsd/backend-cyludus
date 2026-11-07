
import "dotenv/config";

export function exigirAutorizacaoEscrita() {
  if (process.env.ALLOW_DB_TEST_WRITES !== "true") {
    throw new Error(
      "Escrita no banco bloqueada. Configure ALLOW_DB_TEST_WRITES=true para autorizar testes de integração."
    );
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const url = new URL(connectionString);

  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
    if (process.env.CONFIRM_DEV_DATABASE !== "true") {
      throw new Error(
        "Banco remoto bloqueado. Confirme que é um banco exclusivo de desenvolvimento."
      );
    }
  }
}
