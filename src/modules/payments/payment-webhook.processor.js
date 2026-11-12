import { prisma } from "../../config/prisma.ts";
import { consultarOrderMercadoPago } from "./mercadopago-order.service.js";
import {
  validarIdentidadeOrderMercadoPago,
  validarTransacaoAprovadaMercadoPago,
} from "./payment-order.validation.js";

export async function consultarPedidoNotificado({ orderId }) {
  if (typeof orderId !== "string" || !orderId.trim()) {
    const erro = new Error(
      "O identificador da Order do Mercado Pago é obrigatório.",
    );

    erro.statusCode = 400;
    throw erro;
  }

  const id = orderId.trim();

  const order = await consultarOrderMercadoPago({ id });

  if (!order || order.id !== id) {
    const erro = new Error(
      "A Order retornada pelo Mercado Pago não corresponde à notificação.",
    );

    erro.statusCode = 422;
    throw erro;
  }

  return order;
}

export async function localizarPagamentoNotificado({ order }) {
  const referencia = order?.external_reference;

  if (typeof referencia !== "string" || !referencia.trim()) {
    const erro = new Error("A Order não possui uma referência externa válida.");

    erro.statusCode = 422;
    throw erro;
  }

  const pagamento = await prisma.payment.findUnique({
    where: {
      id: referencia,
    },
    include: {
      enrollment: true,
    },
  });

  if (!pagamento) {
    const erro = new Error("Pagamento não encontrado para a Order informada.");

    erro.statusCode = 404;
    throw erro;
  }

  if (pagamento.provider !== "MERCADO_PAGO") {
    const erro = new Error("O pagamento não pertence ao Mercado Pago.");

    erro.statusCode = 422;
    throw erro;
  }

  if (
    !pagamento.enrollment ||
    pagamento.enrollment.id !== pagamento.enrollmentId
  ) {
    const erro = new Error(
      "A inscrição vinculada ao pagamento não foi encontrada.",
    );

    erro.statusCode = 422;
    throw erro;
  }

  return pagamento;
}

export function validarVinculoOrderPagamento({ order, pagamento }) {
  return validarIdentidadeOrderMercadoPago({
    order,
    pagamento,
  });
}

export function validarPagamentoAprovadoNotificado({ order, pagamento }) {
  return validarTransacaoAprovadaMercadoPago({
    order,
    pagamento,
  });
}

export function verificarPagamentoJaProcessado({
  pagamento,
  providerPaymentId,
}) {
  if (pagamento?.status !== "APPROVED") {
    return false;
  }

  if (pagamento.providerPaymentId !== providerPaymentId) {
    const erro = new Error("O pagamento já foi aprovado com outra transação.");

    erro.statusCode = 409;
    throw erro;
  }

  return true;
}

export function identificarNotificacaoReembolso({ order }) {
  const reembolsos = order?.transactions?.refunds;

  if (reembolsos === undefined || reembolsos === null) {
    return false;
  }

  if (!Array.isArray(reembolsos)) {
    const erro = new Error(
      "Os registros de reembolso da Order são inválidos.",
    );

    erro.statusCode = 422;
    throw erro;
  }

  return reembolsos.length > 0;
}
