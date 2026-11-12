
import {
  consultarPedidoNotificado,
  localizarPagamentoNotificado,
  validarVinculoOrderPagamento,
  validarPagamentoAprovadoNotificado,
  verificarPagamentoJaProcessado,
  identificarNotificacaoReembolso,
} from "./payment-webhook.processor.js";

import {
  consultarPagamentoMercadoPago,
} from "./mercadopago-order.service.js";

import {
  validarDataAprovacaoMercadoPago,
  validarPrazoAprovacaoMercadoPago,
} from "./payment-order.validation.js";

import {
  registrarPagamentoAprovado,
} from "./payment-webhook.persistence.js";

import {
  buscarOcorrenciaFinanceira,
} from "./payment-incident.service.js";

import {
  validarReembolsoTotalMercadoPago,
} from "./payment-refund.validation.js";

import {
  registrarPagamentoReembolsado,
} from "./payment-refund.persistence.js";

export async function processarWebhookPagamento({
  orderId,
  agora = new Date(),
}) {
  // Consulta a Order diretamente no Mercado Pago.
  const order = await consultarPedidoNotificado({ orderId });

  // Localiza o pagamento e sua inscrição no banco.
  const pagamento = await localizarPagamentoNotificado({ order });

  // Confirma identidade, moeda e valor da Order.
  validarVinculoOrderPagamento({ order, pagamento });

  // =========================================================
  // FLUXO DE REEMBOLSO
  // =========================================================

  if (identificarNotificacaoReembolso({ order })) {
    // Exige que o pagamento original esteja identificado.
    if (
      typeof pagamento.providerPaymentId !== "string" ||
      !pagamento.providerPaymentId.trim()
    ) {
      const erro = new Error(
        "O pagamento original do reembolso não foi identificado.",
      );

      erro.statusCode = 422;
      throw erro;
    }

    // Consulta o pagamento original na API Payment.
    const pagamentoMercadoPago =
      await consultarPagamentoMercadoPago({
        id: pagamento.providerPaymentId,
      });

    // Confirma o reembolso integral nas APIs Order e Payment.
    const reembolso = validarReembolsoTotalMercadoPago({
      order,
      pagamento,
      pagamentoMercadoPago,
    });

    // Persiste o status REFUNDED e a ocorrência financeira
    // na mesma transação do PostgreSQL.
    const resultado = await registrarPagamentoReembolsado({
      pagamento,
      providerPaymentId: reembolso.providerPaymentId,
      agora,
    });

    // O status da inscrição permanece inalterado.
    return {
      ...resultado,
      enrollmentStatus: pagamento.enrollment.status,
    };
  }

  // =========================================================
  // FLUXO DE APROVAÇÃO
  // =========================================================

  // Confirma a existência de uma transação aprovada.
  const transacao = validarPagamentoAprovadoNotificado({
    order,
    pagamento,
  });

  // Consulta a data real de aprovação no Mercado Pago.
  const pagamentoConsultado = await consultarPagamentoMercadoPago({
    id: transacao.providerPaymentId,
  });

  // Valida os dados do pagamento consultado.
  const dataAprovacao = validarDataAprovacaoMercadoPago({
    pagamentoConsultado,
    providerPaymentId: transacao.providerPaymentId,
    pagamento,
  });

  // Apenas pagamentos pendentes ou aprovados
  // podem seguir pelo fluxo de aprovação.
  if (!["PENDING", "APPROVED"].includes(pagamento.status)) {
    const erro = new Error(
      "O pagamento não está disponível para aprovação.",
    );

    erro.statusCode = 409;
    throw erro;
  }

  // Verifica se o pagamento já foi processado.
  const jaProcessado = verificarPagamentoJaProcessado({
    pagamento,
    providerPaymentId: transacao.providerPaymentId,
  });

  if (jaProcessado) {
    // Pagamento aprovado com inscrição ativa.
    if (pagamento.enrollment.status === "ACTIVE") {
      return {
        paymentStatus: "APPROVED",
        enrollmentStatus: "ACTIVE",
        alreadyProcessed: true,
      };
    }

    // Inscrições não ativas exigem ocorrência financeira.
    const ocorrencia = await buscarOcorrenciaFinanceira({
      paymentId: pagamento.id,
      providerPaymentId: transacao.providerPaymentId,
      types: [
        "ENROLLMENT_CONFLICT",
        "ENROLLMENT_EXPIRED",
        "ENROLLMENT_CANCELLED",
      ],
    });

    const tiposPermitidosPorStatus = {
      PENDING: ["ENROLLMENT_CONFLICT"],
      EXPIRED: [
        "ENROLLMENT_CONFLICT",
        "ENROLLMENT_EXPIRED",
      ],
      CANCELLED: ["ENROLLMENT_CANCELLED"],
    };

    const tiposPermitidos =
      tiposPermitidosPorStatus[pagamento.enrollment.status] ?? [];

    if (
      !ocorrencia ||
      !tiposPermitidos.includes(ocorrencia.type)
    ) {
      const erro = new Error(
        "O pagamento está aprovado, mas a inscrição não está ativa.",
      );

      erro.statusCode = 409;
      throw erro;
    }

    return {
      paymentStatus: "APPROVED",
      enrollmentStatus: pagamento.enrollment.status,
      incidentType: ocorrencia.type,
      alreadyProcessed: true,
    };
  }

  // Impede aprovar uma inscrição que já está ativa
  // enquanto o pagamento permanece pendente.
  if (
    pagamento.status === "PENDING" &&
    pagamento.enrollment.status === "ACTIVE"
  ) {
    const erro = new Error(
      "O pagamento está pendente, mas a inscrição já está ativa.",
    );

    erro.statusCode = 409;
    throw erro;
  }

  // =========================================================
  // VALIDAÇÃO DO PRAZO DE APROVAÇÃO
  // =========================================================

  try {
    validarPrazoAprovacaoMercadoPago({
      dataAprovacao,
      expiresAt: pagamento.enrollment.expiresAt,
      agora,
    });
  } catch (erro) {
    const pagamentoForaDoPrazo =
      erro?.statusCode === 422 &&
      erro?.code === "PAYMENT_APPROVED_AFTER_EXPIRATION";

    // Pagamentos aprovados após o vencimento
    // seguem para conciliação financeira.
    if (!pagamentoForaDoPrazo) {
      throw erro;
    }
  }

  // =========================================================
  // PERSISTÊNCIA DA APROVAÇÃO
  // =========================================================

  let resultado;

  try {
    resultado = await registrarPagamentoAprovado({
      pagamento,
      transacao,
      dataAprovacao,
      agora,
    });
  } catch (erro) {
    // Recupera somente conflitos conhecidos
    // de aprovação concorrente.
    const conflitoConcorrente =
      erro?.statusCode === 409 &&
      (
        erro.message ===
          "O pagamento não está disponível para aprovação." ||
        erro.message ===
          "O pagamento já foi aprovado e não pode ser processado novamente."
      );

    if (!conflitoConcorrente) {
      throw erro;
    }

    // Consulta novamente o estado persistido.
    const pagamentoAtual = await localizarPagamentoNotificado({
      order,
    });

    // Confirma que o vínculo não foi alterado.
    if (
      !pagamentoAtual ||
      pagamentoAtual.id !== pagamento.id ||
      pagamentoAtual.enrollmentId !== pagamento.enrollmentId ||
      pagamentoAtual.providerOrderId !== pagamento.providerOrderId
    ) {
      throw erro;
    }

    // Revalida a identidade da Order.
    validarVinculoOrderPagamento({
      order,
      pagamento: pagamentoAtual,
    });

    // Confirma se outra execução já aprovou
    // a mesma transação.
    const jaProcessado = verificarPagamentoJaProcessado({
      pagamento: pagamentoAtual,
      providerPaymentId: transacao.providerPaymentId,
    });

    if (!jaProcessado) {
      throw erro;
    }

    if (pagamentoAtual.enrollment?.status === "ACTIVE") {
      return {
        paymentStatus: "APPROVED",
        enrollmentStatus: "ACTIVE",
        alreadyProcessed: true,
      };
    }

    // Inscrições não ativas exigem ocorrência compatível.
    const tiposPermitidosPorStatus = {
      PENDING: ["ENROLLMENT_CONFLICT"],
      EXPIRED: [
        "ENROLLMENT_CONFLICT",
        "ENROLLMENT_EXPIRED",
      ],
      CANCELLED: ["ENROLLMENT_CANCELLED"],
    };

    const tiposPermitidos =
      tiposPermitidosPorStatus[
        pagamentoAtual.enrollment?.status
      ] ?? [];

    if (tiposPermitidos.length === 0) {
      throw erro;
    }

    const ocorrencia = await buscarOcorrenciaFinanceira({
      paymentId: pagamentoAtual.id,
      providerPaymentId: transacao.providerPaymentId,
      types: [
        "ENROLLMENT_CONFLICT",
        "ENROLLMENT_EXPIRED",
        "ENROLLMENT_CANCELLED",
      ],
    });

    if (
      !ocorrencia ||
      !tiposPermitidos.includes(ocorrencia.type)
    ) {
      throw erro;
    }

    return {
      paymentStatus: "APPROVED",
      enrollmentStatus: pagamentoAtual.enrollment.status,
      incidentType: ocorrencia.type,
      alreadyProcessed: true,
    };
  }

  return {
    ...resultado,
    alreadyProcessed: false,
  };
}
