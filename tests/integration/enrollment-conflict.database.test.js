import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { prisma } from "../../src/config/prisma.ts";
import { exigirAutorizacaoEscrita } from "./database-safety.js";

describe("PostgreSQL — conflito de inscrições", () => {
  it("deve reverter a transação quando duas inscrições ficam ACTIVE", async () => {
    exigirAutorizacaoEscrita();

    const identificador = randomUUID();
    const email = `teste-${identificador}@example.invalid`;
    const slug = `teste-${identificador}`;

    let userId;
    let courseId;
    let enrollmentId;

    try {
      const usuario = await prisma.user.create({
        data: {
          name: "Usuário de teste de integração",
          email,
          passwordHash: "TEST_ONLY_NOT_A_REAL_PASSWORD",
        },
      });
      userId = usuario.id;

      const curso = await prisma.course.create({
        data: {
          title: "Curso de teste de integração",
          slug,
          price: "100.00",
        },
      });
      courseId = curso.id;

      const inscricaoAtiva = await prisma.enrollment.create({
        data: {
          userId,
          courseId,
          status: "ACTIVE",
          priceAtPurchase: "100.00",
          expiresAt: new Date("2030-01-01T00:00:00Z"),
        },
      });

      const inscricaoExpirada = await prisma.enrollment.create({
        data: {
          userId,
          courseId,
          status: "EXPIRED",
          priceAtPurchase: "100.00",
          expiresAt: new Date("2030-01-01T00:00:00Z"),
        },
      });

      enrollmentId = inscricaoExpirada.id;

      let erroCapturado;

      try {
        await prisma.$transaction(async (tx) => {
          await tx.enrollment.update({
            where: { id: enrollmentId },
            data: { status: "ACTIVE" },
          });
        });
      } catch (erro) {
        erroCapturado = erro;
      }

      expect(erroCapturado).toBeDefined();

      console.log("Detalhes do conflito:", {
        code: erroCapturado?.code,
        modelName: erroCapturado?.meta?.modelName,
        target: erroCapturado?.meta?.target,
        cause: erroCapturado?.meta?.driverAdapterError?.cause,
      });

      expect(erroCapturado?.code).toBe("P2002");

      const inscricaoDepois = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
      });

      expect(inscricaoDepois.status).toBe("EXPIRED");

      const ativaDepois = await prisma.enrollment.findUnique({
        where: { id: inscricaoAtiva.id },
      });

      expect(ativaDepois.status).toBe("ACTIVE");
    } finally {
      // Exclui somente os registros criados por este teste.
      if (userId && courseId) {
        await prisma.enrollment.deleteMany({
          where: {
            userId,
            courseId,
          },
        });
      }

      if (courseId) {
        await prisma.course.delete({
          where: { id: courseId },
        });
      }

      if (userId) {
        await prisma.user.delete({
          where: { id: userId },
        });
      }
    }
  });
});
