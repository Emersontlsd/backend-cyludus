import {
  consultarOrderMercadoPago,
  consultarPagamentoMercadoPago,
} from "./mercadopago-order.service.js";

import { validarReembolsoTotalMercadoPago } from "./payment-refund.validation.js";

import { registrarPagamentoReembolsado } from "./payment-refund.persistence.js";

export async function reconciliarReembolsoPagamento({
  pagamento,
  agora = new Date(),
}) {
  if (
    pagamento?.status !== "APPROVED" ||
    typeof pagamento.providerOrderId !== "string" ||
    !pagamento.providerOrderId.trim() ||
    typeof pagamento.providerPaymentId !== "string" ||
    !pagamento.providerPaymentId.trim()
  ) {
    const erro = new Error(
      "O pagamento não está disponível para reconciliação de reembolso.",
    );

    erro.statusCode = 422;
    throw erro;
  }

  const order = await consultarOrderMercadoPago({
    id: pagamento.providerOrderId,
  });

  const pagamentoMercadoPago = await consultarPagamentoMercadoPago({
    id: pagamento.providerPaymentId,
  });

  const reembolsosOrder = order?.transactions?.refunds;
  const reembolsosPagamento = pagamentoMercadoPago?.refunds;

  const semReembolsos =
    Array.isArray(reembolsosOrder) &&
    Array.isArray(reembolsosPagamento) &&
    reembolsosOrder.length === 0 &&
    reembolsosPagamento.length === 0;

  let reembolso;

  try {
    reembolso = validarReembolsoTotalMercadoPago({
      order,
      pagamento,
      pagamentoMercadoPago,
    });
  } catch (erro) {
    if (erro?.code === "REFUND_NOT_FULLY_CONFIRMED") {
      return {
        paymentStatus: pagamento.status,
        refundStatus: semReembolsos ? "NO_REFUND" : "NOT_FULLY_CONFIRMED",
        reconciled: false,
      };
    }

    throw erro;
  }

  const resultado = await registrarPagamentoReembolsado({
    pagamento,
    providerPaymentId: reembolso.providerPaymentId,
    agora,
  });

  return {
    ...resultado,
    reconciled: true,
  };
}
