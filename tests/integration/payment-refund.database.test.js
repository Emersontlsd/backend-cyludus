import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { prisma } from "../../src/config/prisma.ts";
import { registrarPagamentoReembolsado } from "../../src/modules/payments/payment-refund.persistence.js";
import { exigirAutorizacaoEscrita } from "./database-safety.js";

describe("PostgreSQL — reembolso integral", () => {
  it("persiste reembolso e ocorrência sem alterar a matrícula", async () => {
    exigirAutorizacaoEscrita();

    const identificador = randomUUID();
    const agora = new Date();

    let userId;
    let courseId;
    let enrollmentId;
    let paymentId;

    try {
      const usuario = await prisma.user.create({
        data: {
          name: "Usuário temporário - reembolso",
          email: `reembolso-${identificador}@example.invalid`,
          passwordHash: "TEST_ONLY_NOT_A_REAL_PASSWORD",
        },
      });
      userId = usuario.id;

      const curso = await prisma.course.create({
        data: {
          title: "Curso temporário - reembolso",
          slug: `reembolso-${identificador}`,
          price: "149.90",
        },
      });
      courseId = curso.id;

      const inscricao = await prisma.enrollment.create({
        data: {
          userId,
          courseId,
          status: "ACTIVE",
          priceAtPurchase: "149.90",
          expiresAt: new Date(agora.getTime() + 3600000),
          activatedAt: agora,
        },
      });
      enrollmentId = inscricao.id;

      const pagamento = await prisma.payment.create({
        data: {
          enrollmentId,
          amount: "149.90",
          status: "APPROVED",
          providerOrderId: `order-${identificador}`,
          providerPaymentId: `payment-${identificador}`,
          approvedAt: agora,
        },
      });
      paymentId = pagamento.id;

      const parametros = {
        pagamento,
        providerPaymentId: pagamento.providerPaymentId,
        agora,
      };

      const resultado = await registrarPagamentoReembolsado(parametros);

      expect(resultado.paymentStatus).toBe("REFUNDED");
      expect(resultado.alreadyProcessed).toBe(false);

      const pagamentoFinal = await prisma.payment.findUnique({
        where: { id: paymentId },
      });

      expect(pagamentoFinal.status).toBe("REFUNDED");
      expect(pagamentoFinal.refundedAt).toEqual(agora);

      const ocorrencias = await prisma.paymentIncident.findMany({
        where: {
          paymentId,
          type: "PAYMENT_REFUNDED",
          status: "OPEN",
        },
      });

      expect(ocorrencias).toHaveLength(1);
      expect(ocorrencias[0].providerPaymentId).toBe(
        pagamento.providerPaymentId,
      );

      const inscricaoFinal = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
      });

      expect(inscricaoFinal.status).toBe("ACTIVE");
      expect(inscricaoFinal.activatedAt).toEqual(agora);

      // Repetir a operação não deve criar outra ocorrência.
      const repeticao = await registrarPagamentoReembolsado(parametros);

      expect(repeticao.alreadyProcessed).toBe(true);

      const ocorrenciasDepois = await prisma.paymentIncident.count({
        where: {
          paymentId,
          type: "PAYMENT_REFUNDED",
          status: "OPEN",
        },
      });

      expect(ocorrenciasDepois).toBe(1);
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

  it("desfaz o reembolso quando a ocorrência financeira falha", async () => {
    exigirAutorizacaoEscrita();

    const identificador = randomUUID();
    const agora = new Date();

    let userId;
    let courseId;
    let enrollmentId;
    let paymentId;

    try {
      const usuario = await prisma.user.create({
        data: {
          name: "Usuário temporário - rollback",
          email: `rollback-${identificador}@example.invalid`,
          passwordHash: "TEST_ONLY_NOT_A_REAL_PASSWORD",
        },
      });
      userId = usuario.id;

      const curso = await prisma.course.create({
        data: {
          title: "Curso temporário - rollback",
          slug: `rollback-${identificador}`,
          price: "149.90",
        },
      });
      courseId = curso.id;

      const inscricao = await prisma.enrollment.create({
        data: {
          userId,
          courseId,
          status: "ACTIVE",
          priceAtPurchase: "149.90",
          expiresAt: new Date(agora.getTime() + 3600000),
          activatedAt: agora,
        },
      });
      enrollmentId = inscricao.id;

      const pagamento = await prisma.payment.create({
        data: {
          enrollmentId,
          amount: "149.90",
          status: "APPROVED",
          providerOrderId: `order-rollback-${identificador}`,
          providerPaymentId: `payment-rollback-${identificador}`,
          approvedAt: agora,
        },
      });
      paymentId = pagamento.id;

      // Uma ocorrência aberta existente será reutilizada
      // pelo serviço, preservando a idempotência.
      await prisma.paymentIncident.create({
        data: {
          paymentId,
          type: "PAYMENT_REFUNDED",
          status: "OPEN",
          reason: "Ocorrência pré-existente para teste.",
          providerPaymentId: pagamento.providerPaymentId,
        },
      });

      const resultado = await registrarPagamentoReembolsado({
        pagamento,
        providerPaymentId: pagamento.providerPaymentId,
        agora,
      });

      expect(resultado.paymentStatus).toBe("REFUNDED");

      const ocorrencias = await prisma.paymentIncident.findMany({
        where: {
          paymentId,
          type: "PAYMENT_REFUNDED",
          status: "OPEN",
        },
      });

      expect(ocorrencias).toHaveLength(1);
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

  it("reverte a atualização financeira quando uma operação da transação falha", async () => {
    exigirAutorizacaoEscrita();

    const identificador = randomUUID();
    const agora = new Date();

    let userId;
    let courseId;
    let enrollmentId;
    let paymentId;

    try {
      const usuario = await prisma.user.create({
        data: {
          name: "Usuário temporário - atomicidade",
          email: `atomicidade-${identificador}@example.invalid`,
          passwordHash: "TEST_ONLY_NOT_A_REAL_PASSWORD",
        },
      });
      userId = usuario.id;

      const curso = await prisma.course.create({
        data: {
          title: "Curso temporário - atomicidade",
          slug: `atomicidade-${identificador}`,
          price: "149.90",
        },
      });
      courseId = curso.id;

      const inscricao = await prisma.enrollment.create({
        data: {
          userId,
          courseId,
          status: "ACTIVE",
          priceAtPurchase: "149.90",
          expiresAt: new Date(agora.getTime() + 3600000),
          activatedAt: agora,
        },
      });
      enrollmentId = inscricao.id;

      const pagamento = await prisma.payment.create({
        data: {
          enrollmentId,
          amount: "149.90",
          status: "APPROVED",
          providerOrderId: `order-atomicidade-${identificador}`,
          providerPaymentId: `payment-atomicidade-${identificador}`,
          approvedAt: agora,
        },
      });
      paymentId = pagamento.id;

      await expect(
        prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: paymentId },
            data: {
              status: "REFUNDED",
              refundedAt: agora,
            },
          });

          // Simula uma falha posterior à atualização.
          throw new Error("Falha simulada na ocorrência financeira.");
        }),
      ).rejects.toThrow("Falha simulada na ocorrência financeira.");

      const pagamentoFinal = await prisma.payment.findUnique({
        where: { id: paymentId },
      });

      expect(pagamentoFinal.status).toBe("APPROVED");
      expect(pagamentoFinal.refundedAt).toBeNull();

      const ocorrencias = await prisma.paymentIncident.count({
        where: { paymentId },
      });

      expect(ocorrencias).toBe(0);

      const inscricaoFinal = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
      });

      expect(inscricaoFinal.status).toBe("ACTIVE");
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

  it("não duplica reembolsos em solicitações simultâneas", async () => {
    exigirAutorizacaoEscrita();

    const identificador = randomUUID();
    const agora = new Date();

    let userId;
    let courseId;
    let enrollmentId;
    let paymentId;

    try {
      const usuario = await prisma.user.create({
        data: {
          name: "Usuário temporário - concorrência de reembolso",
          email: `refund-concurrency-${identificador}@example.invalid`,
          passwordHash: "TEST_ONLY_NOT_A_REAL_PASSWORD",
        },
      });
      userId = usuario.id;

      const curso = await prisma.course.create({
        data: {
          title: "Curso temporário - concorrência de reembolso",
          slug: `refund-concurrency-${identificador}`,
          price: "149.90",
        },
      });
      courseId = curso.id;

      const inscricao = await prisma.enrollment.create({
        data: {
          userId,
          courseId,
          status: "ACTIVE",
          priceAtPurchase: "149.90",
          expiresAt: new Date(agora.getTime() + 3600000),
          activatedAt: agora,
        },
      });
      enrollmentId = inscricao.id;

      const pagamento = await prisma.payment.create({
        data: {
          enrollmentId,
          amount: "149.90",
          status: "APPROVED",
          providerOrderId: `order-refund-${identificador}`,
          providerPaymentId: `payment-refund-${identificador}`,
          approvedAt: agora,
        },
      });
      paymentId = pagamento.id;

      const parametros = {
        pagamento,
        providerPaymentId: pagamento.providerPaymentId,
        agora,
      };

      const resultados = await Promise.allSettled([
        registrarPagamentoReembolsado(parametros),
        registrarPagamentoReembolsado(parametros),
      ]);

      const concluidos = resultados.filter(
        (resultado) => resultado.status === "fulfilled",
      );

      const rejeitados = resultados.filter(
        (resultado) => resultado.status === "rejected",
      );

      // Uma operação pode ser concluída e a outra rejeitada
      // por conflito de concorrência. O estado final deve
      // permanecer consistente.
      expect(concluidos.length).toBeGreaterThanOrEqual(1);
      expect(concluidos.length + rejeitados.length).toBe(2);

      const pagamentoFinal = await prisma.payment.findUnique({
        where: { id: paymentId },
      });

      expect(pagamentoFinal.status).toBe("REFUNDED");
      expect(pagamentoFinal.refundedAt).not.toBeNull();

      const ocorrencias = await prisma.paymentIncident.findMany({
        where: {
          paymentId,
          type: "PAYMENT_REFUNDED",
          status: "OPEN",
        },
      });

      expect(ocorrencias).toHaveLength(1);

      const inscricaoFinal = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
      });

      expect(inscricaoFinal.status).toBe("ACTIVE");
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

  it("reverte o pagamento quando o serviço falha ao registrar a ocorrência", async () => {
    exigirAutorizacaoEscrita();

    const identificador = randomUUID();
    const agora = new Date();

    let userId;
    let courseId;
    let enrollmentId;
    let paymentId;

    try {
      const usuario = await prisma.user.create({
        data: {
          name: "Usuário temporário - rollback do serviço",
          email: `refund-rollback-${identificador}@example.invalid`,
          passwordHash: "TEST_ONLY_NOT_A_REAL_PASSWORD",
        },
      });
      userId = usuario.id;

      const curso = await prisma.course.create({
        data: {
          title: "Curso temporário - rollback do serviço",
          slug: `refund-rollback-${identificador}`,
          price: "149.90",
        },
      });
      courseId = curso.id;

      const inscricao = await prisma.enrollment.create({
        data: {
          userId,
          courseId,
          status: "ACTIVE",
          priceAtPurchase: "149.90",
          expiresAt: new Date(agora.getTime() + 3600000),
          activatedAt: agora,
        },
      });
      enrollmentId = inscricao.id;

      const pagamento = await prisma.payment.create({
        data: {
          enrollmentId,
          amount: "149.90",
          status: "APPROVED",
          providerOrderId: `order-refund-rollback-${identificador}`,
          providerPaymentId: `payment-refund-rollback-${identificador}`,
          approvedAt: agora,
        },
      });
      paymentId = pagamento.id;

      let ocorrenciaExecutada = false;

      const registrarOcorrenciaComFalha = async ({ db }) => {
        // Confirma que a atualização ocorreu dentro da transação.
        const pagamentoNaTransacao = await db.payment.findUnique({
          where: { id: paymentId },
        });

        expect(pagamentoNaTransacao.status).toBe("REFUNDED");
        expect(pagamentoNaTransacao.refundedAt).toEqual(agora);

        ocorrenciaExecutada = true;

        throw new Error("Falha controlada na ocorrência financeira.");
      };

      await expect(
        registrarPagamentoReembolsado({
          pagamento,
          providerPaymentId: pagamento.providerPaymentId,
          agora,
          registrarOcorrencia: registrarOcorrenciaComFalha,
        }),
      ).rejects.toThrow("Falha controlada na ocorrência financeira.");

      expect(ocorrenciaExecutada).toBe(true);

      // Fora da transação, a atualização deve ter sido revertida.
      const pagamentoFinal = await prisma.payment.findUnique({
        where: { id: paymentId },
      });

      expect(pagamentoFinal.status).toBe("APPROVED");
      expect(pagamentoFinal.refundedAt).toBeNull();

      const ocorrencias = await prisma.paymentIncident.count({
        where: { paymentId },
      });

      expect(ocorrencias).toBe(0);

      const inscricaoFinal = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
      });

      expect(inscricaoFinal.status).toBe("ACTIVE");
      expect(inscricaoFinal.activatedAt).toEqual(agora);
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
