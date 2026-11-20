
const SOURCE = "refund-reconciliation";

const EVENTOS_RECONCILIACAO = new Set([
  "REFUND_RECONCILIATION_COMPLETED",
  "REFUND_RECONCILIATION_SKIPPED_LOCKED",
  "REFUND_RECONCILIATION_FAILED",
]);

const ISO_UTC =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function objetoValido(valor) {
  return valor !== null &&
    typeof valor === "object" &&
    !Array.isArray(valor);
}

function interpretarTimestamp(valor) {
  if (typeof valor !== "string" || !ISO_UTC.test(valor)) {
    return null;
  }

  const data = new Date(valor);

  if (
    !Number.isFinite(data.getTime()) ||
    data.toISOString() !== valor
  ) {
    return null;
  }

  return data.getTime();
}

function adicionarProblema(problemas, tipo, executionId, detalhe = null) {
  problemas.push({ tipo, executionId, detalhe });
}

export function analisarConsistenciaTemporalReconciliacao(
  registros,
  { inicio, fim } = {},
) {
  if (!Array.isArray(registros)) {
    throw new TypeError("Os registros devem ser fornecidos em um array.");
  }

  const inicioMs = interpretarTimestamp(inicio);
  const fimMs = interpretarTimestamp(fim);

  if (
    inicioMs === null ||
    fimMs === null ||
    inicioMs > fimMs
  ) {
    throw new TypeError("Informe uma janela temporal UTC válida.");
  }

  const problemas = [];
  const eventos = new Map();
  const alertas = new Map();

  let totalAnalisados = 0;

  for (const [indice, registro] of registros.entries()) {
    if (!objetoValido(registro)) {
      adicionarProblema(problemas, "INVALID_RECORD", null, { indice });
      continue;
    }

    const ehAlerta = registro.source === SOURCE;

    const ehEvento =
      !ehAlerta &&
      EVENTOS_RECONCILIACAO.has(registro.event) &&
      ("status" in registro || "exitCode" in registro);

    if (!ehAlerta && !ehEvento) {
      continue;
    }

    totalAnalisados++;

    const executionId =
      typeof registro.executionId === "string" &&
      UUID_V4.test(registro.executionId)
        ? registro.executionId.toLowerCase()
        : null;

    if (registro.timestamp === undefined || registro.timestamp === null) {
      adicionarProblema(
        problemas,
        "MISSING_TIMESTAMP",
        executionId,
        { indice },
      );
      continue;
    }

    const timestampMs = interpretarTimestamp(registro.timestamp);

    if (timestampMs === null) {
      adicionarProblema(
        problemas,
        "INVALID_TIMESTAMP",
        executionId,
        { indice },
      );
      continue;
    }

    if (timestampMs < inicioMs) {
      adicionarProblema(
        problemas,
        "BEFORE_WINDOW",
        executionId,
        { indice, timestamp: registro.timestamp },
      );
    }

    if (timestampMs > fimMs) {
      adicionarProblema(
        problemas,
        "AFTER_WINDOW",
        executionId,
        { indice, timestamp: registro.timestamp },
      );
    }

    if (executionId === null) {
      continue;
    }

    const destino = ehAlerta ? alertas : eventos;

    if (!destino.has(executionId)) {
      destino.set(executionId, timestampMs);
    }
  }

  for (const [executionId, horarioAlerta] of alertas) {
    const horarioEvento = eventos.get(executionId);

    if (
      horarioEvento !== undefined &&
      horarioAlerta < horarioEvento
    ) {
      adicionarProblema(
        problemas,
        "ALERT_BEFORE_EVENT",
        executionId,
      );
    }
  }

  return {
    consistente: problemas.length === 0,
    totalAnalisados,
    totalProblemas: problemas.length,
    problemas,
  };
}
