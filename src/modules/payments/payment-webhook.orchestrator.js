import {
  consultarPedidoNotificado,
  localizarPagamentoNotificado,
  validarVinculoOrderPagamento,
  validarPagamentoAprovadoNotificado,
  verificarPagamentoJaProcessado,
} from "./payment-webhook.processor.js";

import { consultarPagamentoMercadoPago } from "./mercadopago-order.service.js";

import {
  validarDataAprovacaoMercadoPago,
  validarPrazoAprovacaoMercadoPago,
} from "./payment-order.validation.js";

import { registrarPagamentoAprovado } from "./payment-webhook.persistence.js";

import { buscarOcorrenciaFinanceira } from "./payment-incident.service.js";

export async function processarWebhookPagamento({
  orderId,
  agora = new Date(),
}) {
  // consulta a order diretamente no mercado pago
  const order = await consultarPedidoNotificado({ orderId });

  // localiza o pagamento e sua inscricao no banco
  const pagamento = await localizarPagamentoNotificado({ order });

  // confirma identidade, moeda e valor da Order
  validarVinculoOrderPagamento({ order, pagamento });

  // confirma a existência de uma transação aprovada
  const transacao = validarPagamentoAprovadoNotificado({
    order,
    pagamento,
  });

  // consulta o pagamento para obter a data real de aprovação
  const pagamentoConsultado = await consultarPagamentoMercadoPago({
    id: transacao.providerPaymentId,
  });

  // confirma os dados do pagamento consultado
  const dataAprovacao = validarDataAprovacaoMercadoPago({
    pagamentoConsultado,
    providerPaymentId: transacao.providerPaymentId,
    pagamento,
  });

  // Apenas pagamentos pendentes ou já aprovados
  // podem seguir pelo fluxo de aprovação.
  if (!["PENDING", "APPROVED"].includes(pagamento.status)) {
    const erro = new Error("O pagamento não está disponível para aprovação.");

    erro.statusCode = 409;
    throw erro;
  }

  // Verifica se o pagamento já foi processado.
  const jaProcessado = verificarPagamentoJaProcessado({
    pagamento,
    providerPaymentId: transacao.providerPaymentId,
  });

  if (jaProcessado) {
    // Pagamento aprovado e inscrição ativa:
    // o processamento já foi concluído normalmente.
    if (pagamento.enrollment.status === "ACTIVE") {
      return {
        paymentStatus: "APPROVED",
        enrollmentStatus: "ACTIVE",
        alreadyProcessed: true,
      };
    }

    // Inscrições não ativas só podem ser reconhecidas
    // como processadas quando há ocorrência financeira.
    const ocorrencia = await buscarOcorrenciaFinanceira({
      paymentId: pagamento.id,
      providerPaymentId: transacao.providerPaymentId,
      types: [
        "ENROLLMENT_CONFLICT",
        "ENROLLMENT_EXPIRED",
        "ENROLLMENT_CANCELLED",
      ],
    });

    // Não aceitar uma ocorrência de outro estado da inscrição.
    const tiposPermitidosPorStatus = {
      PENDING: ["ENROLLMENT_CONFLICT"],
      EXPIRED: ["ENROLLMENT_CONFLICT", "ENROLLMENT_EXPIRED"],
      CANCELLED: ["ENROLLMENT_CANCELLED"],
    };

    const tiposPermitidos =
      tiposPermitidosPorStatus[pagamento.enrollment.status] ?? [];

    if (!ocorrencia || !tiposPermitidos.includes(ocorrencia.type)) {
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

  // Impede aprovar novamente uma inscrição já ativa.
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

  // Para pagamentos ainda não processados,
  // verifica se a aprovação ocorreu dentro do prazo.
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

    // Pagamentos tardios seguem para conciliação financeira.
    // Os demais erros continuam interrompendo o processamento.
    if (!pagamentoForaDoPrazo) {
      throw erro;
    }
  }

  // aprova o pagamento e ativa a inscricao na mesma transacao
  let resultado;

  try {
    resultado = await registrarPagamentoAprovado({
      pagamento,
      transacao,
      dataAprovacao,
      agora
    });
  } catch (erro) {
    // recupera somente o conflito conhecido da aprovação concorrente
    const conflitoConcorrente =
      erro?.statusCode === 409 &&
      (
        erro.message === "O pagamento não está disponível para aprovação." ||
        erro.message === "O pagamento já foi aprovado e não pode ser processado novamente."
      );

      if (!conflitoConcorrente) {
        throw erro;
      }

      // consulta novamente o estado persistido após o conflito
      const pagamentoAtual = await localizarPagamentoNotificado({ order });

      // garante que a Order continua vinculada ao mesmo pagamento
      if (
        !pagamentoAtual ||
        pagamentoAtual.id !== pagamento.id ||
        pagamentoAtual.enrollmentId !== pagamento.enrollmentId ||
        pagamentoAtual.providerOrderId !== pagamento.providerOrderId
      ) {
        throw erro;
      }

      // revalida a identidade da Order, moeda e valor
      validarVinculoOrderPagamento({
        order,
        pagamento: pagamentoAtual,
      });

      // reutiliza a proteção contra transações divergentes
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

      // inscrições não ativas exigem ocorrência financeira compativel
      const tiposPermitidosPorStatus = {
        PENDING: ["ENROLLMENT_CONFLICT"],
        EXPIRED: ["ENROLLMENT_CONFLICT", "ENROLLMENT_EXPIRED"],
        CANCELLED: ["ENROLLMENT_CANCELLED"],
      };

      const tiposPermitidos =
        tiposPermitidosPorStatus[pagamentoAtual.enrollment?.status] ?? [];

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

      if (!ocorrencia || !tiposPermitidos.includes(ocorrencia.type)) {
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
