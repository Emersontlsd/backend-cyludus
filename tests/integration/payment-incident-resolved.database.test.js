
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { prisma } from "../../src/config/prisma.ts";
import { buscarOcorrenciaFinanceira } from "../../src/modules/payments/payment-incident.service.js";
import { exigirAutorizacaoEscrita } from "./database-safety.js";

describe("PostgreSQL - ocorrencia financeira resolvida", () => {
  it("reconhece ocorrencia RESOLVED sem alterar registros", async () => {
    exigirAutorizacaoEscrita();

    const identificador = randomUUID();
    const agora = new Date();

    let userId;
    let courseId;
    let enrollmentId;
    let paymentId;
    let incidentId;

    const providerPaymentId = `resolved-${identificador}`;

    try {
      const usuario = await prisma.user.create({
        data: {
          name: "Usuario temporario - ocorrencia resolvida",
          email: `resolved-${identificador}@example.invalid`,
          passwordHash: "TEST_ONLY_NOT_A_REAL_PASSWORD",
        },
      });

      userId = usuario.id;

      const curso = await prisma.course.create({
        data: {
          title: "Curso temporario - ocorrencia resolvida",
          slug: `resolved-${identificador}`,
          price: "100.00",
        },
      });

      courseId = curso.id;

      const inscricao = await prisma.enrollment.create({
        data: {
          userId,
          courseId,
          status: "EXPIRED",
          priceAtPurchase: "100.00",
          expiresAt: new Date(agora.getTime() - 60 * 60_000),
        },
      });

      enrollmentId = inscricao.id;

      const pagamento = await prisma.payment.create({
        data: {
          enrollmentId,
          amount: "100.00",
          status: "APPROVED",
          providerOrderId: `order-resolved-${identificador}`,
          providerPaymentId,
          approvedAt: new Date(agora.getTime() - 30 * 60_000),
        },
      });

      paymentId = pagamento.id;

      const ocorrencia = await prisma.paymentIncident.create({
        data: {
          paymentId,
          providerPaymentId,
          type: "ENROLLMENT_EXPIRED",
          status: "RESOLVED",
          reason: "Pagamento aprovado apos vencimento.",
          resolvedAt: agora,
        },
      });

      incidentId = ocorrencia.id;

      const encontrada = await buscarOcorrenciaFinanceira({
        paymentId,
        providerPaymentId,
        types: ["ENROLLMENT_EXPIRED"],
      });

      expect(encontrada).not.toBeNull();
      expect(encontrada.id).toBe(incidentId);
      expect(encontrada.status).toBe("RESOLVED");

      const ocorrenciaDepois = await prisma.paymentIncident.findUnique({
        where: { id: incidentId },
      });

      const pagamentoDepois = await prisma.payment.findUnique({
        where: { id: paymentId },
      });

      const inscricaoDepois = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
      });

      expect(ocorrenciaDepois.status).toBe("RESOLVED");
      expect(ocorrenciaDepois.resolvedAt).toEqual(agora);

      expect(pagamentoDepois.status).toBe("APPROVED");
      expect(pagamentoDepois.providerPaymentId).toBe(providerPaymentId);

      expect(inscricaoDepois.status).toBe("EXPIRED");
      expect(inscricaoDepois.activatedAt).toBeNull();

      expect(
        await prisma.paymentIncident.count({
          where: { paymentId },
        }),
      ).toBe(1);
    } finally {
      // Exclui somente os registros deste teste.
      if (incidentId) {
        await prisma.paymentIncident.deleteMany({
          where: { id: incidentId, paymentId },
        });
      }

      if (paymentId) {
        await prisma.paymentIncident.deleteMany({
          where: { paymentId },
        });

        await prisma.payment.deleteMany({
          where: { id: paymentId },
        });
      }

      if (enrollmentId) {
        await prisma.enrollment.deleteMany({
          where: { id: enrollmentId },
        });
      }

      if (courseId) {
        await prisma.course.deleteMany({
          where: { id: courseId },
        });
      }

      if (userId) {
        await prisma.user.deleteMany({
          where: { id: userId },
        });
      }
    }
  });
});
