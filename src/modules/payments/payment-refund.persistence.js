import { prisma } from "../../config/prisma.ts";

import { registrarOcorrenciaFinanceira } from "./payment-incident.service.js";

function criarErro(mensagem, statusCode = 409) {
  const erro = new Error(mensagem);
  erro.statusCode = statusCode;
  return erro;
}

export async function registrarPagamentoReembolsado({
  pagamento,
  providerPaymentId,
  agora = new Date(),
  registrarOcorrencia = registrarOcorrenciaFinanceira,
}) {
  if (
    typeof pagamento?.id !== "string" ||
    !pagamento.id.trim() ||
    typeof pagamento.providerOrderId !== "string" ||
    !pagamento.providerOrderId.trim() ||
    typeof pagamento.enrollmentId !== "string" ||
    !pagamento.enrollmentId.trim() ||
    typeof providerPaymentId !== "string" ||
    !providerPaymentId.trim()
  ) {
    throw criarErro("Os dados do reembolso são inválidos.", 422);
  }

  if (!(agora instanceof Date) || !Number.isFinite(agora.getTime())) {
    throw criarErro("A data do reembolso é inválida.", 422);
  }

  return prisma.$transaction(async (tx) => {
    const pagamentoAtual = await tx.payment.findUnique({
      where: {
        id: pagamento.id,
      },
    });

    if (!pagamentoAtual) {
      throw criarErro("O pagamento não foi encontrado.", 404);
    }

    if (
      pagamentoAtual.providerOrderId !== pagamento.providerOrderId ||
      pagamentoAtual.enrollmentId !== pagamento.enrollmentId ||
      pagamentoAtual.providerPaymentId !== providerPaymentId
    ) {
      throw criarErro("Os vínculos do pagamento foram alterados.");
    }

    if (pagamentoAtual.status === "REFUNDED") {
      const ocorrencia = await registrarOcorrencia({
        paymentId: pagamento.id,
        type: "PAYMENT_REFUNDED",
        reason: "Reembolso integral confirmado pelo Mercado Pago.",
        providerPaymentId,
        db: tx,
      });

      return {
        paymentStatus: "REFUNDED",
        incidentType: "PAYMENT_REFUNDED",
        alreadyProcessed: true,
        incidentAlreadyExists: ocorrencia.alreadyExists,
      };
    }

    if (pagamentoAtual.status !== "APPROVED") {
      throw criarErro("O pagamento não está disponível para reembolso.");
    }

    const pagamentoAtualizado = await tx.payment.updateMany({
      where: {
        id: pagamento.id,
        enrollmentId: pagamento.enrollmentId,
        providerOrderId: pagamento.providerOrderId,
        providerPaymentId,
        status: "APPROVED",
      },
      data: {
        status: "REFUNDED",
        refundedAt: agora,
      },
    });

    if (pagamentoAtualizado.count !== 1) {
      throw criarErro("O pagamento não está disponível para atualização.");
    }

    await registrarOcorrencia({
      paymentId: pagamento.id,
      type: "PAYMENT_REFUNDED",
      reason: "Reembolso integral confirmado pelo Mercado Pago.",
      providerPaymentId,
      db: tx,
    });

    return {
      paymentStatus: "REFUNDED",
      incidentType: "PAYMENT_REFUNDED",
      alreadyProcessed: false,
    };
  });
}
