
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { prisma } from "../../src/config/prisma.ts";
import { registrarPagamentoAprovado } from "../../src/modules/payments/payment-webhook.persistence.js";
import { exigirAutorizacaoEscrita } from "./database-safety.js";

describe("PostgreSQL — persistência financeira", () => {
  it("deve aprovar o pagamento e registrar conflito sem ativar inscrição duplicada", async () => {
    exigirAutorizacaoEscrita();

    const identificador = randomUUID();
    const agora = new Date();
    const dataAprovacao = new Date(agora.getTime() - 60_000);
    const vencimento = new Date(agora.getTime() + 60 * 60_000);

    let userId;
    let courseId;
    let enrollmentId;
    let paymentId;

    try {
      const usuario = await prisma.user.create({
        data: {
          name: "Usuário temporário de integração",
          email: `integracao-${identificador}@example.invalid`,
          passwordHash: "TEST_ONLY_NOT_A_REAL_PASSWORD",
        },
      });
      userId = usuario.id;

      const curso = await prisma.course.create({
        data: {
          title: "Curso temporário de integração",
          slug: `integracao-${identificador}`,
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
          expiresAt: vencimento,
          activatedAt: agora,
        },
      });

      const inscricaoExpirada = await prisma.enrollment.create({
        data: {
          userId,
          courseId,
          status: "EXPIRED",
          priceAtPurchase: "100.00",
          expiresAt: vencimento,
        },
      });
      enrollmentId = inscricaoExpirada.id;

      const pagamento = await prisma.payment.create({
        data: {
          enrollmentId,
          amount: "100.00",
          status: "PENDING",
          providerOrderId: `order-test-${identificador}`,
        },
      });
      paymentId = pagamento.id;

      const resultado = await registrarPagamentoAprovado({
        pagamento,
        transacao: {
          providerPaymentId: `payment-test-${identificador}`,
          paymentMethod: "pix",
          installments: 1,
        },
        dataAprovacao,
        agora,
      });

      expect(resultado).toEqual({
        paymentStatus: "APPROVED",
        enrollmentStatus: "EXPIRED",
        incidentType: "ENROLLMENT_CONFLICT",
      });

      const pagamentoDepois = await prisma.payment.findUnique({
        where: { id: paymentId },
      });

      expect(pagamentoDepois.status).toBe("APPROVED");

      const inscricaoDepois = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
      });

      expect(inscricaoDepois.status).toBe("EXPIRED");

      const inscricaoOriginal = await prisma.enrollment.findUnique({
        where: { id: inscricaoAtiva.id },
      });

      expect(inscricaoOriginal.status).toBe("ACTIVE");

      const ocorrencias = await prisma.paymentIncident.findMany({
        where: {
          paymentId,
          type: "ENROLLMENT_CONFLICT",
          status: "OPEN",
        },
      });

      expect(ocorrencias).toHaveLength(1);
      expect(ocorrencias[0].providerPaymentId).toBe(
        `payment-test-${identificador}`
      );
    } finally {
      // Exclui somente os registros identificados neste teste.
      if (paymentId) {
        await prisma.paymentIncident.deleteMany({
          where: { paymentId },
        });

        await prisma.payment.deleteMany({
          where: { id: paymentId },
        });
      }

      if (userId && courseId) {
        await prisma.enrollment.deleteMany({
          where: { userId, courseId },
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
