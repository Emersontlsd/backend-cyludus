const EVENTOS_VALIDOS = new Set([
  "REFUND_RECONCILIATION_COMPLETED",
  "REFUND_RECONCILIATION_SKIPPED_LOCKED",
  "REFUND_RECONCILIATION_FAILED",
]);

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function objetoValido(valor) {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

function adicionarProblema(problemas, tipo, executionId = null) {
  problemas.push({ tipo, executionId });
}

export function analisarCompletudeReconciliacao(manifesto, registros) {
  if (
    !objetoValido(manifesto) ||
    manifesto.schemaVersion !== 1 ||
    !Array.isArray(manifesto.expectedExecutions)
  ) {
    throw new TypeError("Manifesto de execuções inválido.");
  }

  if (!Array.isArray(registros)) {
    throw new TypeError("Os registros devem ser um array.");
  }

  const problemas = [];
  const esperadas = new Map();
  const encontradas = new Map();

  for (const execucao of manifesto.expectedExecutions) {
    if (
      !objetoValido(execucao) ||
      typeof execucao.executionId !== "string" ||
      !UUID_V4.test(execucao.executionId) ||
      (execucao.expectedEvent !== undefined &&
        !EVENTOS_VALIDOS.has(execucao.expectedEvent))
    ) {
      throw new TypeError("Execução esperada inválida.");
    }

    const id = execucao.executionId.toLowerCase();

    if (esperadas.has(id)) {
      adicionarProblema(problemas, "DUPLICATE_EXPECTED_EXECUTION", id);
      continue;
    }

    esperadas.set(id, execucao.expectedEvent);
  }

  for (const registro of registros) {
    if (!objetoValido(registro)) {
      continue;
    }

    // Somente eventos finais são considerados.
    // Alertas não representam uma nova execução.
    if (
      registro.source === "refund-reconciliation" ||
      !EVENTOS_VALIDOS.has(registro.event) ||
      typeof registro.executionId !== "string" ||
      !UUID_V4.test(registro.executionId)
    ) {
      continue;
    }

    const id = registro.executionId.toLowerCase();

    if (!encontradas.has(id)) {
      encontradas.set(id, []);
    }

    encontradas.get(id).push(registro.event);
  }

  let totalEncontradas = 0;

  for (const [id, expectedEvent] of esperadas) {
    const eventos = encontradas.get(id);

    if (!eventos || eventos.length === 0) {
      adicionarProblema(problemas, "MISSING_EXECUTION", id);
      continue;
    }

    totalEncontradas++;

    if (expectedEvent !== undefined && !eventos.includes(expectedEvent)) {
      adicionarProblema(problemas, "UNEXPECTED_EVENT", id);
    }
  }

  for (const id of encontradas.keys()) {
    if (!esperadas.has(id)) {
      adicionarProblema(problemas, "UNEXPECTED_EXECUTION", id);
    }
  }

  return {
    completo: problemas.length === 0,
    totalEsperadas: esperadas.size,
    totalEncontradas,
    totalAusentes: esperadas.size - totalEncontradas,
    totalInesperadas: [...encontradas.keys()].filter((id) => !esperadas.has(id))
      .length,
    problemas,
  };
}
