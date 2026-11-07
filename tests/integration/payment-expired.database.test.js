import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { prisma } from "../../src/config/prisma.ts";
import { registrarPagamentoAprovado } from "../../src/modules/payments/payment-webhook.persistence.js";
import { exigirAutorizacaoEscrita } from "./database-safety.js";

describe("PostgreSQL - pagamento aprovado após vencimento", () => {
  it.each(["EXPIRED", "PENDING"])(
    "concilia pagamento tardio com inscrição inicialmente %s",
    async (statusInicial) => {
      exigirAutorizacaoEscrita();

      const identificador = randomUUID();

      const agora = new Date();
      const vencimento = new Date(agora.getTime() - 60 * 60_000);
      const dataAprovacao = new Date(agora.getTime() - 30 * 60_000);

      let userId;
      let courseId;
      let enrollmentId;
      let paymentId;

      try {
        const usuario = await prisma.user.create({
          data: {
            name: "Usuário temporário - pagamento expirado",
            email: `expirado-${identificador}@example.invalid`,
            passwordHash: "TEST_ONLY_NOT_A_REAL_PASSWORD",
          },
        });

        userId = usuario.id;

        const curso = await prisma.course.create({
          data: {
            title: "Curso temporário - pagamento expirado",
            slug: `expirado-${identificador}`,
            price: "100.00",
          },
        });

        courseId = curso.id;

        const inscricao = await prisma.enrollment.create({
          data: {
            userId,
            courseId,
            status: statusInicial,
            priceAtPurchase: "100.00",
            expiresAt: vencimento,
          },
        });

        enrollmentId = inscricao.id;

        const pagamento = await prisma.payment.create({
          data: {
            enrollmentId,
            amount: "100.00",
            status: "PENDING",
            providerOrderId: `order-expirado-${identificador}`,
          },
        });

        paymentId = pagamento.id;

        const providerPaymentId = `payment-expirado-${identificador}`;

        const resultado = await registrarPagamentoAprovado({
          pagamento,
          transacao: {
            providerPaymentId,
            paymentMethod: "pix",
            installments: 1,
          },
          dataAprovacao,
          agora,
        });

        expect(resultado).toEqual({
          paymentStatus: "APPROVED",
          enrollmentStatus: "EXPIRED",
          incidentType: "ENROLLMENT_EXPIRED",
        });

        const pagamentoDepois = await prisma.payment.findUnique({
          where: { id: paymentId },
        });

        expect(pagamentoDepois.status).toBe("APPROVED");
        expect(pagamentoDepois.providerPaymentId).toBe(providerPaymentId);

        const inscricaoDepois = await prisma.enrollment.findUnique({
          where: { id: enrollmentId },
        });

        expect(inscricaoDepois.status).toBe("EXPIRED");
        expect(inscricaoDepois.activatedAt).toBeNull();

        const ocorrencias = await prisma.paymentIncident.findMany({
          where: {
            paymentId,
            type: "ENROLLMENT_EXPIRED",
            status: "OPEN",
          },
        });

        expect(ocorrencias).toHaveLength(1);
        expect(ocorrencias[0].providerPaymentId).toBe(providerPaymentId);
      } finally {
        // Remove apenas os registros criados por este teste.
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
    },
  );
});
