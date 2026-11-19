import { describe, expect, it } from "vitest";

import { analisarIntegridadeReconciliacao } from "../src/modules/monitoring/refund-reconciliation.integrity.js";

const ID_1 = "550e8400-e29b-41d4-a716-446655440000";
const ID_2 = "550e8400-e29b-41d4-a716-446655440001";

function evento(executionId = ID_1) {
  return {
    executionId,
    event: "REFUND_RECONCILIATION_COMPLETED",
    status: "SUCCESS",
    exitCode: 0,
  };
}

function alerta(executionId = ID_1) {
  return {
    source: "refund-reconciliation",
    executionId,
    event: "REFUND_RECONCILIATION_COMPLETED",
    severity: "INFO",
    requiresAttention: false,
  };
}

function possuiProblema(resultado, tipo) {
  return resultado.problemas.some((problema) => problema.tipo === tipo);
}

describe("Integridade dos registros de reconciliação", () => {
  it("aceita evento e alerta correlacionados", () => {
    const resultado = analisarIntegridadeReconciliacao([evento(), alerta()]);

    expect(resultado.integro).toBe(true);
    expect(resultado.totalEventos).toBe(1);
    expect(resultado.totalAlertas).toBe(1);
    expect(resultado.problemas).toHaveLength(0);
  });

  it("aceita registros JSON", () => {
    const resultado = analisarIntegridadeReconciliacao([
      JSON.stringify(evento()),
      JSON.stringify(alerta()),
    ]);

    expect(resultado.integro).toBe(true);
  });

  it("aceita múltiplas execuções independentes", () => {
    const resultado = analisarIntegridadeReconciliacao([
      evento(ID_1),
      alerta(ID_1),
      evento(ID_2),
      alerta(ID_2),
    ]);

    expect(resultado.integro).toBe(true);
    expect(resultado.totalEventos).toBe(2);
  });

  it("detecta evento final duplicado", () => {
    const resultado = analisarIntegridadeReconciliacao([
      evento(),
      evento(),
      alerta(),
    ]);

    expect(possuiProblema(resultado, "DUPLICATE_EVENT")).toBe(true);
    expect(resultado.integro).toBe(false);
  });

  it("detecta alerta duplicado", () => {
    const resultado = analisarIntegridadeReconciliacao([
      evento(),
      alerta(),
      alerta(),
    ]);

    expect(possuiProblema(resultado, "DUPLICATE_ALERT")).toBe(true);
  });

  it("detecta evento sem alerta", () => {
    const resultado = analisarIntegridadeReconciliacao([evento()]);

    expect(possuiProblema(resultado, "MISSING_ALERT")).toBe(true);
  });

  it("detecta alerta órfão", () => {
    const resultado = analisarIntegridadeReconciliacao([alerta()]);

    expect(possuiProblema(resultado, "ORPHAN_ALERT")).toBe(true);
  });

  it("detecta evento com status incompatível", () => {
    const resultado = analisarIntegridadeReconciliacao([
      { ...evento(), status: "FAILED" },
      alerta(),
    ]);

    expect(possuiProblema(resultado, "INCONSISTENT_EVENT")).toBe(true);
  });

  it("detecta evento com código incompatível", () => {
    const resultado = analisarIntegridadeReconciliacao([
      { ...evento(), exitCode: 1 },
      alerta(),
    ]);

    expect(possuiProblema(resultado, "INCONSISTENT_EVENT")).toBe(true);
  });

  it("detecta alerta com gravidade incompatível", () => {
    const resultado = analisarIntegridadeReconciliacao([
      evento(),
      { ...alerta(), severity: "ERROR" },
    ]);

    expect(possuiProblema(resultado, "INCONSISTENT_ALERT")).toBe(true);
  });

  it("detecta alerta associado ao evento errado", () => {
    const resultado = analisarIntegridadeReconciliacao([
      evento(),
      {
        ...alerta(),
        event: "REFUND_RECONCILIATION_FAILED",
      },
    ]);

    expect(possuiProblema(resultado, "INCONSISTENT_ALERT")).toBe(true);
  });

  it("mantém compatibilidade com registros legados", () => {
    const resultado = analisarIntegridadeReconciliacao(
      [
        { ...evento(), executionId: undefined },
        { ...alerta(), executionId: undefined },
      ].map((registro) => {
        const { executionId, ...legado } = registro;
        return legado;
      }),
    );

    expect(resultado.registrosLegados).toBe(2);
    expect(resultado.integro).toBe(true);
    expect(resultado.totalEventos).toBe(0);
    expect(resultado.totalAlertas).toBe(0);
  });

  it("rejeita executionId inválido", () => {
    const resultado = analisarIntegridadeReconciliacao([evento("id-invalido")]);

    expect(possuiProblema(resultado, "INVALID_EXECUTION_ID")).toBe(true);
  });

  it("detecta JSON inválido", () => {
    const resultado = analisarIntegridadeReconciliacao(["{json inválido"]);

    expect(possuiProblema(resultado, "INVALID_RECORD")).toBe(true);
  });

  it("detecta registros desconhecidos", () => {
    const resultado = analisarIntegridadeReconciliacao([
      { mensagem: "registro desconhecido" },
    ]);

    expect(possuiProblema(resultado, "UNKNOWN_RECORD")).toBe(true);
  });

  it("aceita coleção vazia sem inventar execuções ausentes", () => {
    const resultado = analisarIntegridadeReconciliacao([]);

    expect(resultado.integro).toBe(true);
    expect(resultado.totalRegistros).toBe(0);
  });

  it("rejeita entrada que não seja array", () => {
    expect(() => analisarIntegridadeReconciliacao(null)).toThrow(TypeError);
  });

  it("detecta evento desconhecido com UUID válido", () => {
    const resultado = analisarIntegridadeReconciliacao([
      {
        ...evento(),
        event: "EVENTO_DESCONHECIDO",
      },
      alerta(),
    ]);

    expect(possuiProblema(resultado, "INCONSISTENT_EVENT")).toBe(true);
    expect(resultado.integro).toBe(false);
  });

  it("detecta evento legado inconsistente", () => {
    const resultado = analisarIntegridadeReconciliacao([
      {
        event: "REFUND_RECONCILIATION_COMPLETED",
        status: "FAILED",
        exitCode: 0,
      },
    ]);

    expect(resultado.registrosLegados).toBe(1);
    expect(possuiProblema(resultado, "INCONSISTENT_EVENT")).toBe(true);
    expect(resultado.integro).toBe(false);
  });

  it("detecta alerta com requiresAttention incompatível", () => {
    const resultado = analisarIntegridadeReconciliacao([
      evento(),
      {
        ...alerta(),
        requiresAttention: true,
      },
    ]);

    expect(possuiProblema(resultado, "INCONSISTENT_ALERT")).toBe(true);
  });

  it("detecta evento sem campos obrigatórios", () => {
    const resultado = analisarIntegridadeReconciliacao([
      {
        executionId: ID_1,
        event: "REFUND_RECONCILIATION_COMPLETED",
      },
    ]);

    expect(possuiProblema(resultado, "UNKNOWN_RECORD")).toBe(true);
  });
});
