import { describe, expect, it } from "vitest";

import { analisarCompletudeReconciliacao } from "../src/modules/monitoring/refund-reconciliation.completeness.js";

const ID1 = "550e8400-e29b-41d4-a716-446655440000";
const ID2 = "550e8400-e29b-41d4-a716-446655440001";
const ID3 = "550e8400-e29b-41d4-a716-446655440002";

const COMPLETED = "REFUND_RECONCILIATION_COMPLETED";
const SKIPPED = "REFUND_RECONCILIATION_SKIPPED_LOCKED";
const FAILED = "REFUND_RECONCILIATION_FAILED";

function criarManifesto() {
  return {
    schemaVersion: 1,
    expectedExecutions: [
      { executionId: ID1, expectedEvent: COMPLETED },
      { executionId: ID2, expectedEvent: SKIPPED },
    ],
  };
}

function criarRegistros() {
  return [
    {
      executionId: ID1,
      event: COMPLETED,
      status: "SUCCESS",
      exitCode: 0,
    },
    {
      executionId: ID2,
      event: SKIPPED,
      status: "SKIPPED",
      exitCode: 0,
    },
  ];
}

describe("Completude operacional da reconciliação", () => {
  it("aprova quando todas as execuções estão presentes", () => {
    const resultado = analisarCompletudeReconciliacao(
      criarManifesto(),
      criarRegistros(),
    );

    expect(resultado.completo).toBe(true);
    expect(resultado.totalEsperadas).toBe(2);
    expect(resultado.totalEncontradas).toBe(2);
    expect(resultado.totalAusentes).toBe(0);
  });

  it("detecta execução ausente", () => {
    const resultado = analisarCompletudeReconciliacao(criarManifesto(), [
      criarRegistros()[0],
    ]);

    expect(resultado.completo).toBe(false);
    expect(resultado.totalAusentes).toBe(1);
    expect(resultado.problemas).toContainEqual({
      tipo: "MISSING_EXECUTION",
      executionId: ID2,
    });
  });

  it("detecta execução inesperada", () => {
    const registros = [
      ...criarRegistros(),
      {
        executionId: ID3,
        event: FAILED,
        status: "FAILED",
        exitCode: 1,
      },
    ];

    const resultado = analisarCompletudeReconciliacao(
      criarManifesto(),
      registros,
    );

    expect(resultado.totalInesperadas).toBe(1);
    expect(resultado.problemas).toContainEqual({
      tipo: "UNEXPECTED_EXECUTION",
      executionId: ID3,
    });
  });

  it("detecta evento diferente do esperado", () => {
    const registros = criarRegistros();
    registros[0].event = FAILED;

    const resultado = analisarCompletudeReconciliacao(
      criarManifesto(),
      registros,
    );

    expect(resultado.completo).toBe(false);
    expect(resultado.problemas).toContainEqual({
      tipo: "UNEXPECTED_EVENT",
      executionId: ID1,
    });
  });

  it("detecta execução duplicada no manifesto", () => {
    const manifesto = criarManifesto();

    manifesto.expectedExecutions.push({
      executionId: ID1,
      expectedEvent: COMPLETED,
    });

    const resultado = analisarCompletudeReconciliacao(
      manifesto,
      criarRegistros(),
    );

    expect(resultado.problemas).toContainEqual({
      tipo: "DUPLICATE_EXPECTED_EXECUTION",
      executionId: ID1,
    });
  });

  it("ignora alertas ao contar execuções", () => {
    const registros = [
      ...criarRegistros(),
      {
        source: "refund-reconciliation",
        executionId: ID1,
        event: COMPLETED,
        severity: "INFO",
        requiresAttention: false,
      },
    ];

    const resultado = analisarCompletudeReconciliacao(
      criarManifesto(),
      registros,
    );

    expect(resultado.completo).toBe(true);
    expect(resultado.totalEncontradas).toBe(2);
  });

  it("rejeita manifesto inválido", () => {
    expect(() => analisarCompletudeReconciliacao({}, [])).toThrow(TypeError);
  });

  it("rejeita registros inválidos", () => {
    expect(() =>
      analisarCompletudeReconciliacao(criarManifesto(), null),
    ).toThrow(TypeError);
  });

  it("rejeita executionId inválido no manifesto", () => {
    const manifesto = criarManifesto();
    manifesto.expectedExecutions[0].executionId = "id-invalido";

    expect(() => analisarCompletudeReconciliacao(manifesto, [])).toThrow(
      TypeError,
    );
  });

  it("rejeita evento desconhecido no manifesto", () => {
    const manifesto = criarManifesto();
    manifesto.expectedExecutions[0].expectedEvent = "OUTRO_EVENTO";

    expect(() => analisarCompletudeReconciliacao(manifesto, [])).toThrow(
      TypeError,
    );
  });

  it("aceita execução esperada sem tipo de evento definido", () => {
    const manifesto = {
      schemaVersion: 1,
      expectedExecutions: [{ executionId: ID1 }],
    };

    const resultado = analisarCompletudeReconciliacao(manifesto, [
      {
        executionId: ID1,
        event: FAILED,
        status: "FAILED",
        exitCode: 1,
      },
    ]);

    expect(resultado.completo).toBe(true);
    expect(resultado.totalEncontradas).toBe(1);
    expect(resultado.totalAusentes).toBe(0);
  });

  it("detecta ausência mesmo sem tipo de evento definido", () => {
    const manifesto = {
      schemaVersion: 1,
      expectedExecutions: [{ executionId: ID1 }],
    };

    const resultado = analisarCompletudeReconciliacao(manifesto, []);

    expect(resultado.completo).toBe(false);
    expect(resultado.problemas).toContainEqual({
      tipo: "MISSING_EXECUTION",
      executionId: ID1,
    });
  });
});
