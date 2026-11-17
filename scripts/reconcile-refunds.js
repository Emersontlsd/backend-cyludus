import { prisma } from "../src/config/prisma.ts";

import { reconciliarReembolsosEmLote } from "../src/modules/payments/payment-refund.reconciliation-batch.js";

export async function executarReconciliacao({
  reconciliar = reconciliarReembolsosEmLote,
  desconectar = () => prisma.$disconnect(),
  registrarInfo = console.log,
  registrarErro = console.error,
} = {}) {
  let codigoSaida = 0;
  let resultadoExecucao = "REFUND_RECONCILIATION_COMPLETED";
  let resumoExecucao = null;

  try {
    registrarInfo("Iniciando reconciliação de reembolsos...");

    const resumo = await reconciliar();
    resumoExecucao = resumo;

    if (resumo.bloqueado) {
      resultadoExecucao = "REFUND_RECONCILIATION_SKIPPED_LOCKED";

      registrarInfo(
        "Reconciliação não executada: outra instância possui o bloqueio.",
      );
    } else {
      registrarInfo("Reconciliação finalizada:", resumo);

      if (resumo.erros > 0) {
        codigoSaida = 1;
        resultadoExecucao = "REFUND_RECONCILIATION_FAILED";

        registrarErro(`Reconciliação concluída com ${resumo.erros} erro(s).`);
      }
    }
  } catch (erro) {
    codigoSaida = 1;
    resultadoExecucao = "REFUND_RECONCILIATION_FAILED";

    registrarErro("Falha na reconciliação de reembolsos:", erro);
  } finally {
    try {
      await desconectar();
    } catch (erro) {
      codigoSaida = 1;
      resultadoExecucao = "REFUND_RECONCILIATION_FAILED";

      registrarErro("Falha ao desconectar o Prisma:", erro);
    }

    const registrarResultado =
      codigoSaida === 0 ? registrarInfo : registrarErro;

    registrarResultado(resultadoExecucao);

    const eventoEstruturado = {
      event: resultadoExecucao,
      status:
        resultadoExecucao === "REFUND_RECONCILIATION_COMPLETED"
          ? "SUCCESS"
          : resultadoExecucao === "REFUND_RECONCILIATION_SKIPPED_LOCKED"
            ? "SKIPPED"
            : "FAILED",
      exitCode: codigoSaida,
      timestamp: new Date().toISOString(),
      summary: resumoExecucao
        ? {
            verificados: resumoExecucao.verificados ?? 0,
            reembolsados: resumoExecucao.reembolsados ?? 0,
            semReembolso: resumoExecucao.semReembolso ?? 0,
            naoConfirmados: resumoExecucao.naoConfirmados ?? 0,
            erros: resumoExecucao.erros ?? 0,
          }
        : null,
    };

    registrarResultado(JSON.stringify(eventoEstruturado));
  }

  return codigoSaida;
}

export async function iniciarReconciliacao({
  autorizado = process.env.ENABLE_REFUND_RECONCILIATION === "true",
  executar = executarReconciliacao,
  registrarErro = console.error,
} = {}) {
  if (!autorizado) {
    registrarErro(
      "Reconciliação desativada. Defina ENABLE_REFUND_RECONCILIATION=true para autorizar a execução.",
    );

    return 1;
  }

  return executar();
}
