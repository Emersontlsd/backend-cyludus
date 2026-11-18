const CLASSIFICACOES = {
  REFUND_RECONCILIATION_COMPLETED: {
    severity: "INFO",
    requiresAttention: false,
  },
  REFUND_RECONCILIATION_SKIPPED_LOCKED: {
    severity: "WARNING",
    requiresAttention: true,
  },
  REFUND_RECONCILIATION_FAILED: {
    severity: "ERROR",
    requiresAttention: true,
  },
};

export function classificarEventoReconciliacao(registro) {
  let evento;

  try {
    evento = typeof registro === "string" ? JSON.parse(registro) : registro;
  } catch {
    evento = null;
  }

  if (
    !evento ||
    typeof evento !== "object" ||
    Array.isArray(evento) ||
    typeof evento.event !== "string"
  ) {
    return {
      event: "UNKNOWN",
      severity: "ERROR",
      requiresAttention: true,
      reason: "Registro operacional inválido.",
    };
  }

  const classificacao = CLASSIFICACOES[evento.event];

  if (!classificacao) {
    return {
      event: "UNKNOWN",
      severity: "ERROR",
      requiresAttention: true,
      reason: "Registro operacional desconhecido.",
    };
  }

  const statusEsperado = {
    REFUND_RECONCILIATION_COMPLETED: "SUCCESS",
    REFUND_RECONCILIATION_SKIPPED_LOCKED: "SKIPPED",
    REFUND_RECONCILIATION_FAILED: "FAILED",
  }[evento.event];

  const codigoEsperado =
    evento.event === "REFUND_RECONCILIATION_FAILED" ? 1 : 0;

  if (evento.status !== statusEsperado || evento.exitCode !== codigoEsperado) {
    return {
      event: evento.event,
      severity: "ERROR",
      requiresAttention: true,
      reason: "Status ou código de saída incompatível com o evento.",
    };
  }

  return {
    event: evento.event,
    ...classificacao,
  };
}
