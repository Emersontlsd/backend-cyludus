import { prisma } from "../../config/prisma.ts";

import { registrarOcorrenciaFinanceira } from "./payment-incident.service.js";

export async function registrarPagamentoAprovado({
  pagamento,
  transacao,
  dataAprovacao,
  agora = new Date(),
}) {
  // Impede aprovação sem uma Order vinculada.
  if (
    typeof pagamento?.providerOrderId !== "string" ||
    !pagamento.providerOrderId.trim()
  ) {
    const erro = new Error("O pagamento não possui uma Order vinculada.");

    erro.statusCode = 422;
    throw erro;
  }

  if (
    !(dataAprovacao instanceof Date) ||
    !Number.isFinite(dataAprovacao.getTime()) ||
    dataAprovacao > agora
  ) {
    const erro = new Error("A data de aprovação informada é inválida.");

    erro.statusCode = 422;
    throw erro;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // Consulta os dados atuais do pagamento dentro da transação.
      const pagamentoAtual = await tx.payment.findUnique({
        where: {
          id: pagamento.id,
        },
      });

      // Confirma que a Order e a inscrição continuam vinculadas
      // ao mesmo pagamento.
      if (
        !pagamentoAtual ||
        pagamentoAtual.providerOrderId !== pagamento.providerOrderId ||
        pagamentoAtual.enrollmentId !== pagamento.enrollmentId
      ) {
        const erro = new Error(
          "O vínculo da Order com o pagamento foi alterado.",
        );

        erro.statusCode = 409;
        throw erro;
      }

      // Impede reprocessar pagamentos já aprovados.
      // A conciliação de ocorrências existentes será tratada separadamente.
      if (pagamentoAtual.status === "APPROVED") {
        const erro = new Error(
          "O pagamento já foi aprovado e não pode ser processado novamente.",
        );

        erro.statusCode = 409;
        throw erro;
      }

      const inscricaoAtual = await tx.enrollment.findUnique({
        where: {
          id: pagamento.enrollmentId,
        },
      });

      // A inscrição precisa existir e ter uma data válida.
      if (
        !inscricaoAtual ||
        !inscricaoAtual.expiresAt ||
        !Number.isFinite(new Date(inscricaoAtual.expiresAt).getTime())
      ) {
        const erro = new Error(
          "A inscrição vinculada ao pagamento é inválida.",
        );
        erro.statusCode = 409;
        throw erro;
      }

      // Pagamento aprovado após o vencimento:
      // registrar o recebimento financeiro sem ativar a inscrição.
      if (
        ["PENDING", "EXPIRED"].includes(inscricaoAtual.status) &&
        dataAprovacao > new Date(inscricaoAtual.expiresAt)
      ) {
        const pagamentoAtualizado = await tx.payment.updateMany({
          where: {
            id: pagamento.id,
            enrollmentId: pagamento.enrollmentId,
            status: "PENDING",
            providerOrderId: pagamento.providerOrderId,
          },
          data: {
            status: "APPROVED",
            providerPaymentId: transacao.providerPaymentId,
            paymentMethod: transacao.paymentMethod,
            installments: transacao.installments,
            approvedAt: dataAprovacao,
          },
        });

        if (pagamentoAtualizado.count !== 1) {
          const erro = new Error(
            "O pagamento não está disponível para aprovação.",
          );
          erro.statusCode = 409;
          throw erro;
        }

        // Expira a inscrição que ainda estava pendente.
        // Uma inscrição já EXPIRED não precisa ser atualizada.
        if (inscricaoAtual.status === "PENDING") {
          const inscricaoExpirada = await tx.enrollment.updateMany({
            where: {
              id: pagamento.enrollmentId,
              status: "PENDING",
              expiresAt: {
                lt: dataAprovacao,
              },
            },
            data: {
              status: "EXPIRED",
            },
          });

          if (inscricaoExpirada.count !== 1) {
            const erro = new Error(
              "A inscrição não está disponível para expiração.",
            );
            erro.statusCode = 409;
            throw erro;
          }
        }

        await registrarOcorrenciaFinanceira({
          paymentId: pagamento.id,
          type: "ENROLLMENT_EXPIRED",
          reason: "Pagamento aprovado após o vencimento da inscrição.",
          providerPaymentId: transacao.providerPaymentId,
          db: tx,
        });

        return {
          paymentStatus: "APPROVED",
          enrollmentStatus: "EXPIRED",
          incidentType: "ENROLLMENT_EXPIRED",
        };
      }

      // Pagamento confirmado para uma inscrição cancelada.
      // Registra o recebimento sem reativar a inscrição.
      if (inscricaoAtual.status === "CANCELLED") {
        const pagamentoAtualizado = await tx.payment.updateMany({
          where: {
            id: pagamento.id,
            enrollmentId: pagamento.enrollmentId,
            status: "PENDING",
            providerOrderId: pagamento.providerOrderId,
          },
          data: {
            status: "APPROVED",
            providerPaymentId: transacao.providerPaymentId,
            paymentMethod: transacao.paymentMethod,
            installments: transacao.installments,
            approvedAt: dataAprovacao,
          },
        });

        if (pagamentoAtualizado.count !== 1) {
          const erro = new Error(
            "O pagamento não está disponível para aprovação.",
          );
          erro.statusCode = 409;
          throw erro;
        }

        await registrarOcorrenciaFinanceira({
          paymentId: pagamento.id,
          type: "ENROLLMENT_CANCELLED",
          reason: "Pagamento aprovado para uma inscrição cancelada.",
          providerPaymentId: transacao.providerPaymentId,
          db: tx,
        });

        return {
          paymentStatus: "APPROVED",
          enrollmentStatus: "CANCELLED",
          incidentType: "ENROLLMENT_CANCELLED",
        };
      }

      // Outros estados continuam bloqueados nesta etapa.
      if (!["PENDING", "EXPIRED"].includes(inscricaoAtual.status)) {
        const erro = new Error(
          "A inscrição está expirada e não pode ser ativada.",
        );
        erro.statusCode = 409;
        throw erro;
      }

      // Aprova somente um pagamento que ainda esteja pendente.
      const pagamentoAtualizado = await tx.payment.updateMany({
        where: {
          id: pagamento.id,
          enrollmentId: pagamento.enrollmentId,
          status: "PENDING",
          providerOrderId: pagamento.providerOrderId,
        },
        data: {
          status: "APPROVED",
          providerPaymentId: transacao.providerPaymentId,
          paymentMethod: transacao.paymentMethod,
          installments: transacao.installments,
          approvedAt: dataAprovacao,
        },
      });

      if (pagamentoAtualizado.count !== 1) {
        const erro = new Error(
          "O pagamento não está disponível para aprovação.",
        );

        erro.statusCode = 409;
        throw erro;
      }

      // Recupera inscrições expiradas somente quando o pagamento
      // foi efetivamente aprovado dentro do prazo.
      const inscricaoAtualizada = await tx.enrollment.updateMany({
        where: {
          id: pagamento.enrollmentId,
          status: {
            in: ["PENDING", "EXPIRED"],
          },
          expiresAt: {
            gte: dataAprovacao,
          },
        },
        data: {
          status: "ACTIVE",
          activatedAt: agora,
        },
      });

      if (inscricaoAtualizada.count !== 1) {
        const erro = new Error(
          "A inscrição não está disponível para ativação.",
        );

        erro.statusCode = 409;
        throw erro;
      }

      // As duas atualizações precisam ser concluídas
      // para que a transação seja confirmada.

      return {
        paymentStatus: "APPROVED",
        enrollmentStatus: "ACTIVE",
      };
    });
  } catch (erro) {
    // Somente o conflito do índice de inscrições abertas
    // pode ser tratado como ocorrência financeira.

    const alvo = erro?.meta?.target;

    const indicePostgres =
      erro?.meta?.driverAdapterError?.cause?.constraint?.index;

    const conflitoInscricao =
      erro?.code === "P2002" &&
      (indicePostgres === "Enrollment_one_open_per_user_course_key" ||
        alvo === "Enrollment_one_open_per_user_course_key" ||
        (erro?.meta?.modelName === "Enrollment" &&
          Array.isArray(alvo) &&
          alvo.includes("userId") &&
          alvo.includes("courseId")));

    if (!conflitoInscricao) {
      throw erro;
    }

    // A primeira transação já foi revertida pelo Prisma.
    // Uma nova transação registra o recebimento e a ocorrência.
    return prisma.$transaction(async (tx) => {
      const pagamentoAtual = await tx.payment.findUnique({
        where: {
          id: pagamento.id,
        },
      });

      if (
        !pagamentoAtual ||
        pagamentoAtual.providerOrderId !== pagamento.providerOrderId ||
        pagamentoAtual.enrollmentId !== pagamento.enrollmentId
      ) {
        const erroVinculo = new Error(
          "O vínculo da Order com o pagamento foi alterado.",
        );
        erroVinculo.statusCode = 409;
        throw erroVinculo;
      }

      // Outro processamento pode ter aprovado o pagamento
      // entre a primeira e a segunda transação.
      if (pagamentoAtual.status === "APPROVED") {
        const erroPagamento = new Error(
          "O pagamento já foi aprovado e não pode ser processado novamente.",
        );

        erroPagamento.statusCode = 409;
        throw erroPagamento;
      }

      const inscricaoAtual = await tx.enrollment.findUnique({
        where: {
          id: pagamento.enrollmentId,
        },
      });

      if (
        !inscricaoAtual ||
        !["PENDING", "EXPIRED", "CANCELLED"].includes(inscricaoAtual.status)
      ) {
        const erroInscricao = new Error(
          "A inscrição não está disponível para conciliação financeira.",
        );
        erroInscricao.statusCode = 409;
        throw erroInscricao;
      }

      const pagamentoAtualizado = await tx.payment.updateMany({
        where: {
          id: pagamento.id,
          enrollmentId: pagamento.enrollmentId,
          status: "PENDING",
          providerOrderId: pagamento.providerOrderId,
        },
        data: {
          status: "APPROVED",
          providerPaymentId: transacao.providerPaymentId,
          paymentMethod: transacao.paymentMethod,
          installments: transacao.installments,
          approvedAt: dataAprovacao,
        },
      });

      if (pagamentoAtualizado.count !== 1) {
        const erroPagamento = new Error(
          "O pagamento não está disponível para aprovação.",
        );
        erroPagamento.statusCode = 409;
        throw erroPagamento;
      }

      const inscricaoCancelada = inscricaoAtual.status === "CANCELLED";

      const tipoOcorrencia = inscricaoCancelada
        ? "ENROLLMENT_CANCELLED"
        : "ENROLLMENT_CONFLICT";

      const motivoOcorrencia = inscricaoCancelada
        ? "Pagamento aprovado para uma inscrição cancelada."
        : "Pagamento aprovado, mas existe conflito com outra inscrição aberta.";

      await registrarOcorrenciaFinanceira({
        paymentId: pagamento.id,
        type: tipoOcorrencia,
        reason: motivoOcorrencia,
        providerPaymentId: transacao.providerPaymentId,
        db: tx,
      });

      return {
        paymentStatus: "APPROVED",
        enrollmentStatus: inscricaoAtual.status,
        incidentType: tipoOcorrencia,
      };
    });
  }
}
