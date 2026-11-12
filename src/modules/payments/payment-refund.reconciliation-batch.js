import { prisma } from "../../config/prisma.ts";

import { reconciliarReembolsoPagamento } from "./payment-refund.reconciliation.js";

import {
  adquirirBloqueioReconciliacao,
  renovarBloqueioReconciliacao,
  liberarBloqueioReconciliacao,
  obterCursorReconciliacao,
  atualizarCursorReconciliacao,
} from "./payment-refund.reconciliation-cursor.js";

export async function reconciliarReembolsosEmLote({
  limite = 100,
  db = prisma,
  reconciliarPagamento = reconciliarReembolsoPagamento,
  registrarErro = console.error,
} = {}) {
  if (!Number.isInteger(limite) || limite < 1 || limite > 500) {
    throw new Error("O limite deve ser um número inteiro entre 1 e 500.");
  }

  const resumo = {
    verificados: 0,
    reembolsados: 0,
    semReembolso: 0,
    naoConfirmados: 0,
    erros: 0,
  };

  const bloqueio = await adquirirBloqueioReconciliacao({
    db,
  });

  if (!bloqueio.adquirido) {
    return {
      ...resumo,
      bloqueado: true,
    };
  }

  let ultimoId;

  const INTERVALO_RENOVACAO_MS = 60_000;

  let bloqueioPerdido = false;
  let erroRenovacao = null;
  /** @type {Promise<void> | null} */
  let renovacaoEmAndamento = null;

  const renovarBloqueio = async () => {
    if (bloqueioPerdido) {
      return;
    }

    if (renovacaoEmAndamento) {
      return renovacaoEmAndamento;
    }

    renovacaoEmAndamento = (async () => {
      try {
        const resultado = await renovarBloqueioReconciliacao({
          db,
          identificador: bloqueio.identificador,
          duracaoMs: 300_000,
        });

        if (!resultado.renovado) {
          bloqueioPerdido = true;
          erroRenovacao = new Error("O bloqueio de reconciliação foi perdido.");
        }
      } catch (erro) {
        bloqueioPerdido = true;
        erroRenovacao = erro;
      }
    })();

    try {
      await renovacaoEmAndamento;
    } finally {
      renovacaoEmAndamento = null;
    }
  };

  const verificarBloqueio = async () => {
    await renovarBloqueio();

    if (bloqueioPerdido) {
      throw (
        erroRenovacao ?? new Error("O bloqueio de reconciliação foi perdido.")
      );
    }
  };

  let erroProcessamento = null;

  const heartbeat = setInterval(() => {
    void renovarBloqueio();
  }, INTERVALO_RENOVACAO_MS);

  heartbeat.unref?.();

  try {
    ultimoId = await obterCursorReconciliacao({
      db,
      identificador: bloqueio.identificador,
    });

    while (resumo.verificados < limite) {
      const quantidade = Math.min(50, limite - resumo.verificados);

      const pagamentos = await db.payment.findMany({
        where: {
          status: "APPROVED",
          provider: "MERCADO_PAGO",
          providerOrderId: {
            not: null,
          },
          providerPaymentId: {
            not: null,
          },
          ...(ultimoId
            ? {
                id: {
                  gt: ultimoId,
                },
              }
            : {}),
        },
        orderBy: {
          id: "asc",
        },
        take: quantidade,
      });

      if (pagamentos.length === 0) {
        await atualizarCursorReconciliacao({
          db,
          identificador: bloqueio.identificador,
          ultimoId: null,
        });

        ultimoId = null;
        break;
      }

      for (const pagamento of pagamentos) {
        await verificarBloqueio();

        resumo.verificados += 1;

        try {
          const resultado = await reconciliarPagamento({
            pagamento,
          });

          if (resultado.reconciled) {
            resumo.reembolsados += 1;
          } else if (resultado.refundStatus === "NO_REFUND") {
            resumo.semReembolso += 1;
          } else if (resultado.refundStatus === "NOT_FULLY_CONFIRMED") {
            resumo.naoConfirmados += 1;
          } else {
            resumo.erros += 1;

            registrarErro(
              "Resultado inesperado na reconciliação:",
              pagamento.id,
            );
          }
        } catch (erro) {
          resumo.erros += 1;

          registrarErro(
            `Falha ao reconciliar pagamento ${pagamento.id}:`,
            erro,
          );
        }

        await verificarBloqueio();

        await atualizarCursorReconciliacao({
          db,
          identificador: bloqueio.identificador,
          ultimoId: pagamento.id,
        });

        ultimoId = pagamento.id;
      }

      if (pagamentos.length < quantidade) {
        await atualizarCursorReconciliacao({
          db,
          identificador: bloqueio.identificador,
          ultimoId: null,
        });

        ultimoId = null;
        break;
      }
    }

    return resumo;
  } catch (erro) {
    erroProcessamento = erro;
    throw erro;
  } finally {
    clearInterval(heartbeat);

    let erroFinalizacao = null;

    try {
      const renovacaoPendente = renovacaoEmAndamento;

      if (renovacaoPendente) {
        await renovacaoPendente;
      }
    } catch (erro) {
      erroFinalizacao = erro;
    }

    if (bloqueioPerdido) {
      erroFinalizacao ??=
        erroRenovacao ?? new Error("O bloqueio de reconciliação foi perdido.");
    }

    try {
      await liberarBloqueioReconciliacao({
        db,
        identificador: bloqueio.identificador,
      });
    } catch (erro) {
      erroFinalizacao ??= erro;
    }

    if (!erroProcessamento && erroFinalizacao) {
      throw erroFinalizacao;
    }

    if (erroProcessamento && erroFinalizacao) {
      try {
        registrarErro(
          "Falha adicional ao finalizar a reconciliação:",
          erroFinalizacao,
        );
      } catch {
        // Preserva o erro original do processamento.
      }
    }
  }
}
