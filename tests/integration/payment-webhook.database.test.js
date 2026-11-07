import { describe, it, expect } from "vitest";
import { prisma } from "../../src/config/prisma.ts";

describe("Integração PostgreSQL — webhook de pagamentos", () => {
  it("deve possuir os índices de proteção financeira", async () => {
    const indices = await prisma.$queryRaw`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'Enrollment_one_open_per_user_course_key',
          'PaymentIncident_one_open_per_type_key'
        )
    `;

    const nomes = indices.map((indice) => indice.indexname);

    expect(nomes).toContain("Enrollment_one_open_per_user_course_key");

    expect(nomes).toContain("PaymentIncident_one_open_per_type_key");
  });

  it("deve utilizar a configuração correta do banco", () => {
    const url = new URL(process.env.DATABASE_URL);

    console.log("Configuração utilizada pelo Vitest:", {
      host: url.hostname,
      port: url.port,
      database: url.pathname,
      username: url.username,
      passwordConfigured: Boolean(url.password),
    });

    expect(url.username).toBe("postgres");
  });
});
