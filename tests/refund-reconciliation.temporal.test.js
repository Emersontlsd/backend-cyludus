
import { describe, expect, it } from "vitest";

import { analisarConsistenciaTemporalReconciliacao } from
  "../src/modules/monitoring/refund-reconciliation.temporal.js";

const ID = "550e8400-e29b-41d4-a716-446655440000";

const inicio = "2026-11-20T10:00:00.000Z";
const fim = "2026-11-20T12:00:00.000Z";

const evento = {
  executionId: ID,
  event: "REFUND_RECONCILIATION_COMPLETED",
  status: "SUCCESS",
  exitCode: 0,
  timestamp: "2026-11-20T11:00:00.000Z",
};

const alerta = {
  source: "refund-reconciliation",
  executionId: ID,
  event: "REFUND_RECONCILIATION_COMPLETED",
  severity: "INFO",
  requiresAttention: false,
  timestamp: evento.timestamp,
};

function analisar(registros, janela = { inicio, fim }) {
  return analisarConsistenciaTemporalReconciliacao(registros, janela);
}

describe("Consistência temporal da reconciliação", () => {
  it("aprova evento e alerta dentro da janela", () => {
    const resultado = analisar([evento, alerta]);

    expect(resultado.consistente).toBe(true);
    expect(resultado.totalAnalisados).toBe(2);
    expect(resultado.totalProblemas).toBe(0);
  });

  it("aceita registros nos limites da janela", () => {
    const resultado = analisar([
      { ...evento, timestamp: inicio },
      { ...alerta, timestamp: fim },
    ]);

    expect(resultado.consistente).toBe(true);
  });

  it("detecta timestamp ausente", () => {
    const { timestamp, ...semTimestamp } = evento;

    const resultado = analisar([semTimestamp]);

    expect(resultado.problemas).toContainEqual(
      expect.objectContaining({ tipo: "MISSING_TIMESTAMP" }),
    );
  });

  it("detecta timestamp inválido", () => {
    const resultado = analisar([
      { ...evento, timestamp: "data-invalida" },
    ]);

    expect(resultado.problemas).toContainEqual(
      expect.objectContaining({ tipo: "INVALID_TIMESTAMP" }),
    );
  });

  it("rejeita data inexistente no calendário", () => {
    const resultado = analisar([
      { ...evento, timestamp: "2026-02-30T11:00:00.000Z" },
    ]);

    expect(resultado.problemas).toContainEqual(
      expect.objectContaining({ tipo: "INVALID_TIMESTAMP" }),
    );
  });

  it("detecta evento anterior à janela", () => {
    const resultado = analisar([
      { ...evento, timestamp: "2026-11-20T09:59:59.999Z" },
    ]);

    expect(resultado.problemas).toContainEqual(
      expect.objectContaining({ tipo: "BEFORE_WINDOW" }),
    );
  });

  it("detecta evento posterior à janela", () => {
    const resultado = analisar([
      { ...evento, timestamp: "2026-11-20T12:00:00.001Z" },
    ]);

    expect(resultado.problemas).toContainEqual(
      expect.objectContaining({ tipo: "AFTER_WINDOW" }),
    );
  });

  it("detecta alerta anterior ao evento", () => {
    const resultado = analisar([
      evento,
      { ...alerta, timestamp: "2026-11-20T10:59:59.000Z" },
    ]);

    expect(resultado.problemas).toContainEqual(
      expect.objectContaining({ tipo: "ALERT_BEFORE_EVENT" }),
    );
  });

  it("aceita alerta com mesmo horário do evento", () => {
    expect(analisar([evento, alerta]).consistente).toBe(true);
  });

  it("independe da ordem dos registros no arquivo", () => {
    expect(analisar([alerta, evento]).consistente).toBe(true);
  });

  it("ignora registros não relacionados", () => {
    const resultado = analisar([
      { event: "OUTRO_EVENTO" },
      evento,
      alerta,
    ]);

    expect(resultado.consistente).toBe(true);
    expect(resultado.totalAnalisados).toBe(2);
  });

  it("identifica registros inválidos", () => {
    const resultado = analisar([null, evento, alerta]);

    expect(resultado.problemas).toContainEqual(
      expect.objectContaining({ tipo: "INVALID_RECORD" }),
    );
  });

  it("rejeita registros que não sejam array", () => {
    expect(() => analisar(null)).toThrow(TypeError);
  });

  it("rejeita janela inválida", () => {
    expect(() => analisar([evento], {
      inicio: "invalido",
      fim,
    })).toThrow(TypeError);
  });

  it("rejeita janela invertida", () => {
    expect(() => analisar([evento], {
      inicio: fim,
      fim: inicio,
    })).toThrow(TypeError);
  });

  it("não modifica os registros originais", () => {
    const registros = [
      Object.freeze({ ...evento }),
      Object.freeze({ ...alerta }),
    ];

    analisar(registros);

    expect(registros[0]).toEqual(evento);
    expect(registros[1]).toEqual(alerta);
  });
});
