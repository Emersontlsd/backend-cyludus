
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { prisma } from "../../src/config/prisma.ts";
import { registrarPagamentoAprovado } from "../../src/modules/payments/payment-webhook.persistence.js";
import { exigirAutorizacaoEscrita } from "./database-safety.js";

describe("PostgreSQL — concorrência de pagamentos", () => {
  it("deve aprovar apenas uma vez duas solicitações simultâneas", async () => {
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
          name: "Usuário temporário - concorrência",
          email: `concorrencia-${identificador}@example.invalid`,
          passwordHash: "TEST_ONLY_NOT_A_REAL_PASSWORD",
        },
      });
      userId = usuario.id;

      const curso = await prisma.course.create({
        data: {
          title: "Curso temporário - concorrência",
          slug: `concorrencia-${identificador}`,
          price: "100.00",
        },
      });
      courseId = curso.id;

      const inscricao = await prisma.enrollment.create({
        data: {
          userId,
          courseId,
          status: "PENDING",
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
          providerOrderId: `order-concorrencia-${identificador}`,
        },
      });
      paymentId = pagamento.id;

      const parametros = {
        pagamento,
        transacao: {
          providerPaymentId: `payment-concorrencia-${identificador}`,
          paymentMethod: "pix",
          installments: 1,
        },
        dataAprovacao,
        agora,
      };

      const resultados = await Promise.allSettled([
        registrarPagamentoAprovado(parametros),
        registrarPagamentoAprovado(parametros),
      ]);

      const aprovados = resultados.filter(
        (resultado) => resultado.status === "fulfilled",
      );

      const rejeitados = resultados.filter(
        (resultado) => resultado.status === "rejected",
      );

      expect(aprovados).toHaveLength(1);
      expect(rejeitados).toHaveLength(1);

      expect(aprovados[0].value).toEqual({
        paymentStatus: "APPROVED",
        enrollmentStatus: "ACTIVE",
      });

      const pagamentoFinal = await prisma.payment.findUnique({
        where: { id: paymentId },
      });

      expect(pagamentoFinal.status).toBe("APPROVED");
      expect(pagamentoFinal.providerPaymentId).toBe(
        parametros.transacao.providerPaymentId,
      );

      const inscricaoFinal = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
      });

      expect(inscricaoFinal.status).toBe("ACTIVE");
      expect(inscricaoFinal.activatedAt).not.toBeNull();

      const ocorrencias = await prisma.paymentIncident.findMany({
        where: { paymentId },
      });

      expect(ocorrencias).toHaveLength(0);
    } finally {
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
