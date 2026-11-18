
import { classificarEventoReconciliacao } from "./refund-reconciliation.monitor.js";

export function criarAlertaReconciliacao(registro) {
  const classificacao = classificarEventoReconciliacao(registro);

  const mensagens = {
    REFUND_RECONCILIATION_COMPLETED:
      "Reconciliação de reembolsos concluída.",

    REFUND_RECONCILIATION_SKIPPED_LOCKED:
      "Reconciliação ignorada: bloqueio ocupado.",

    REFUND_RECONCILIATION_FAILED:
      "Falha na reconciliação de reembolsos.",

    UNKNOWN:
      "Evento de reconciliação inválido ou desconhecido.",
  };

  return {
    source: "refund-reconciliation",
    event: classificacao.event,
    severity: classificacao.severity,
    requiresAttention: classificacao.requiresAttention,
    message: classificacao.reason ?? mensagens[classificacao.event],
  };
}

export function registrarAlertaReconciliacao(
  registro,
  {
    registrarInfo = console.log,
    registrarErro = console.error,
  } = {},
) {
  const alerta = criarAlertaReconciliacao(registro);

  const registrar =
    alerta.severity === "ERROR" ? registrarErro : registrarInfo;

  registrar(JSON.stringify(alerta));

  return alerta;
}
