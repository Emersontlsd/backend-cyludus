import { prisma } from "../src/config/prisma.ts";

import { reconciliarReembolsosEmLote } from "../src/modules/payments/payment-refund.reconciliation-batch.js";

export async function executarReconciliacao({
  reconciliar = reconciliarReembolsosEmLote,
  desconectar = () => prisma.$disconnect(),
  registrarInfo = console.log,
  registrarErro = console.error,
} = {}) {
  let codigoSaida = 0;

  try {
    registrarInfo("Iniciando reconciliação de reembolsos...");

    const resumo = await reconciliar();

    if (resumo.bloqueado) {
      registrarInfo(
        "Reconciliação não executada: outra instância possui o bloqueio.",
      );
    } else {
      registrarInfo("Reconciliação finalizada:", resumo);

      if (resumo.erros > 0) {
        codigoSaida = 1;
        registrarErro(`Reconciliação concluída com ${resumo.erros} erro(s).`);
      }
    }
  } catch (erro) {
    codigoSaida = 1;
    registrarErro("Falha na reconciliação de reembolsos:", erro);
  } finally {
    try {
      await desconectar();
    } catch (erro) {
      codigoSaida = 1;
      registrarErro("Falha ao desconectar o Prisma:", erro);
    }
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
