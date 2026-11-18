
import { describe, expect, it } from "vitest";

import { classificarEventoReconciliacao } from "../src/modules/monitoring/refund-reconciliation.monitor.js";

describe("Monitoramento operacional da reconciliação", () => {
  it("classifica conclusão como INFO", () => {
    expect(
      classificarEventoReconciliacao({
        event: "REFUND_RECONCILIATION_COMPLETED",
        status: "SUCCESS",
        exitCode: 0,
      }),
    ).toEqual({
      event: "REFUND_RECONCILIATION_COMPLETED",
      severity: "INFO",
      requiresAttention: false,
    });
  });

  it("classifica bloqueio ocupado como WARNING", () => {
    expect(
      classificarEventoReconciliacao({
        event: "REFUND_RECONCILIATION_SKIPPED_LOCKED",
        status: "SKIPPED",
        exitCode: 0,
      }),
    ).toEqual({
      event: "REFUND_RECONCILIATION_SKIPPED_LOCKED",
      severity: "WARNING",
      requiresAttention: true,
    });
  });

  it("classifica falha como ERROR", () => {
    expect(
      classificarEventoReconciliacao({
        event: "REFUND_RECONCILIATION_FAILED",
        status: "FAILED",
        exitCode: 1,
      }),
    ).toEqual({
      event: "REFUND_RECONCILIATION_FAILED",
      severity: "ERROR",
      requiresAttention: true,
    });
  });

  it("interpreta registros JSON", () => {
    const registro = JSON.stringify({
      event: "REFUND_RECONCILIATION_COMPLETED",
      status: "SUCCESS",
      exitCode: 0,
    });

    expect(classificarEventoReconciliacao(registro).severity).toBe("INFO");
  });

  it.each([
    null,
    "",
    "{json inválido",
    [],
    {},
  ])("rejeita registros inválidos: %j", (registro) => {
    expect(classificarEventoReconciliacao(registro)).toMatchObject({
      event: "UNKNOWN",
      severity: "ERROR",
      requiresAttention: true,
    });
  });

  it("rejeita eventos desconhecidos", () => {
    expect(
      classificarEventoReconciliacao({
        event: "EVENTO_DESCONHECIDO",
      }),
    ).toMatchObject({
      event: "UNKNOWN",
      severity: "ERROR",
      requiresAttention: true,
    });
  });

  it("detecta status incompatível", () => {
    expect(
      classificarEventoReconciliacao({
        event: "REFUND_RECONCILIATION_COMPLETED",
        status: "FAILED",
        exitCode: 0,
      }),
    ).toMatchObject({
      severity: "ERROR",
      requiresAttention: true,
    });
  });

  it("detecta código de saída incompatível", () => {
    expect(
      classificarEventoReconciliacao({
        event: "REFUND_RECONCILIATION_FAILED",
        status: "FAILED",
        exitCode: 0,
      }),
    ).toMatchObject({
      severity: "ERROR",
      requiresAttention: true,
    });
  });
});
