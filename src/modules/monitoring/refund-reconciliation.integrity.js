import { classificarEventoReconciliacao } from "./refund-reconciliation.monitor.js";

const SOURCE = "refund-reconciliation";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function interpretarRegistro(registro) {
  if (typeof registro !== "string") return registro;

  try {
    return JSON.parse(registro);
  } catch {
    return null;
  }
}

function objetoValido(valor) {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

function identificadorValido(registro) {
  return (
    typeof registro.executionId === "string" &&
    UUID_V4.test(registro.executionId)
  );
}

function adicionarProblema(
  problemas,
  tipo,
  executionId = null,
  detalhe = null,
) {
  problemas.push({ tipo, executionId, detalhe });
}

export function analisarIntegridadeReconciliacao(registros) {
  if (!Array.isArray(registros)) {
    throw new TypeError("Os registros devem ser fornecidos em um array.");
  }

  const problemas = [];
  const eventos = new Map();
  const alertas = new Map();

  let registrosLegados = 0;

  for (const [indice, entrada] of registros.entries()) {
    const registro = interpretarRegistro(entrada);

    if (!objetoValido(registro)) {
      adicionarProblema(problemas, "INVALID_RECORD", null, { indice });
      continue;
    }

    const ehAlerta = registro.source === SOURCE;
    const ehEvento =
      !ehAlerta &&
      typeof registro.event === "string" &&
      ("status" in registro || "exitCode" in registro);

    if (!ehAlerta && !ehEvento) {
      adicionarProblema(problemas, "UNKNOWN_RECORD", null, { indice });
      continue;
    }

    if (!("executionId" in registro)) {
      registrosLegados++;

      if (ehEvento) {
        const classificacao = classificarEventoReconciliacao(registro);

        if (classificacao.reason) {
          adicionarProblema(problemas, "INCONSISTENT_EVENT", null, {
            indice,
            reason: classificacao.reason,
          });
        }
      }

      continue;
    }

    if (!identificadorValido(registro)) {
      adicionarProblema(problemas, "INVALID_EXECUTION_ID", null, { indice });
      continue;
    }

    const id = registro.executionId.toLowerCase();

    if (ehEvento) {
      const classificacao = classificarEventoReconciliacao(registro);

      if (classificacao.reason) {
        adicionarProblema(problemas, "INCONSISTENT_EVENT", id, {
          indice,
          reason: classificacao.reason,
        });
      }

      if (eventos.has(id)) {
        adicionarProblema(problemas, "DUPLICATE_EVENT", id, { indice });
      } else {
        eventos.set(id, registro);
      }

      continue;
    }

    if (alertas.has(id)) {
      adicionarProblema(problemas, "DUPLICATE_ALERT", id, { indice });
    } else {
      alertas.set(id, registro);
    }
  }

  for (const [id, evento] of eventos) {
    const alerta = alertas.get(id);

    if (!alerta) {
      adicionarProblema(problemas, "MISSING_ALERT", id);
      continue;
    }

    const classificacao = classificarEventoReconciliacao(evento);

    if (
      alerta.event !== classificacao.event ||
      alerta.severity !== classificacao.severity ||
      alerta.requiresAttention !== classificacao.requiresAttention
    ) {
      adicionarProblema(problemas, "INCONSISTENT_ALERT", id);
    }
  }

  for (const id of alertas.keys()) {
    if (!eventos.has(id)) {
      adicionarProblema(problemas, "ORPHAN_ALERT", id);
    }
  }

  return {
    integro: problemas.length === 0,
    totalRegistros: registros.length,
    totalEventos: eventos.size,
    totalAlertas: alertas.size,
    registrosLegados,
    problemas,
  };
}
