import { describe, expect, it, vi } from "vitest";

import {
  criarAlertaReconciliacao,
  registrarAlertaReconciliacao,
} from "../src/modules/monitoring/refund-reconciliation.alert.js";

describe("Alertas operacionais da reconciliação", () => {
  it("cria registro INFO para conclusão", () => {
    const alerta = criarAlertaReconciliacao({
      event: "REFUND_RECONCILIATION_COMPLETED",
      status: "SUCCESS",
      exitCode: 0,
    });

    expect(alerta).toMatchObject({
      severity: "INFO",
      requiresAttention: false,
    });
  });

  it("cria registro WARNING para bloqueio ocupado", () => {
    const alerta = criarAlertaReconciliacao({
      event: "REFUND_RECONCILIATION_SKIPPED_LOCKED",
      status: "SKIPPED",
      exitCode: 0,
    });

    expect(alerta).toMatchObject({
      severity: "WARNING",
      requiresAttention: true,
    });
  });

  it("cria registro ERROR para falha", () => {
    const alerta = criarAlertaReconciliacao({
      event: "REFUND_RECONCILIATION_FAILED",
      status: "FAILED",
      exitCode: 1,
    });

    expect(alerta).toMatchObject({
      severity: "ERROR",
      requiresAttention: true,
    });
  });

  it("trata evento inválido como ERROR", () => {
    const alerta = criarAlertaReconciliacao("{json inválido");

    expect(alerta).toMatchObject({
      event: "UNKNOWN",
      severity: "ERROR",
      requiresAttention: true,
    });
  });

  it("registra INFO em stdout", () => {
    const registrarInfo = vi.fn();
    const registrarErro = vi.fn();

    registrarAlertaReconciliacao(
      {
        event: "REFUND_RECONCILIATION_COMPLETED",
        status: "SUCCESS",
        exitCode: 0,
      },
      { registrarInfo, registrarErro },
    );

    expect(registrarInfo).toHaveBeenCalledOnce();
    expect(registrarErro).not.toHaveBeenCalled();

    expect(JSON.parse(registrarInfo.mock.calls[0][0])).toMatchObject({
      severity: "INFO",
    });
  });

  it("registra ERROR em stderr", () => {
    const registrarInfo = vi.fn();
    const registrarErro = vi.fn();

    registrarAlertaReconciliacao(
      {
        event: "REFUND_RECONCILIATION_FAILED",
        status: "FAILED",
        exitCode: 1,
      },
      { registrarInfo, registrarErro },
    );

    expect(registrarErro).toHaveBeenCalledOnce();
    expect(registrarInfo).not.toHaveBeenCalled();

    expect(JSON.parse(registrarErro.mock.calls[0][0])).toMatchObject({
      severity: "ERROR",
      requiresAttention: true,
    });
  });

  it("registra WARNING em stdout", () => {
    const registrarInfo = vi.fn();
    const registrarErro = vi.fn();

    registrarAlertaReconciliacao(
      {
        event: "REFUND_RECONCILIATION_SKIPPED_LOCKED",
        status: "SKIPPED",
        exitCode: 0,
      },
      { registrarInfo, registrarErro },
    );

    expect(registrarInfo).toHaveBeenCalledOnce();
    expect(registrarErro).not.toHaveBeenCalled();

    expect(JSON.parse(registrarInfo.mock.calls[0][0])).toMatchObject({
      severity: "WARNING",
      requiresAttention: true,
    });
  });

  it("mantém compatibilidade com registros sem executionId", () => {
    const alerta = criarAlertaReconciliacao({
      event: "REFUND_RECONCILIATION_COMPLETED",
      status: "SUCCESS",
      exitCode: 0,
    });

    expect(alerta.event).toBe("REFUND_RECONCILIATION_COMPLETED");
    expect(alerta.severity).toBe("INFO");
    expect(alerta).not.toHaveProperty("executionId");
  });

  it("preserva o timestamp do evento original", () => {
    const timestamp = "2026-11-20T16:30:00.000Z";

    const alerta = criarAlertaReconciliacao({
      executionId: "550e8400-e29b-41d4-a716-446655440000",
      event: "REFUND_RECONCILIATION_COMPLETED",
      status: "SUCCESS",
      exitCode: 0,
      timestamp,
    });

    expect(alerta.timestamp).toBe(timestamp);
    expect(alerta.executionId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("mantém compatibilidade com eventos sem timestamp", () => {
    const alerta = criarAlertaReconciliacao({
      event: "REFUND_RECONCILIATION_COMPLETED",
      status: "SUCCESS",
      exitCode: 0,
    });

    expect(alerta).not.toHaveProperty("timestamp");
    expect(alerta.severity).toBe("INFO");
  });

  it("não propaga timestamp que não seja string", () => {
    const alerta = criarAlertaReconciliacao({
      event: "REFUND_RECONCILIATION_COMPLETED",
      status: "SUCCESS",
      exitCode: 0,
      timestamp: 123456,
    });

    expect(alerta).not.toHaveProperty("timestamp");
  });
});
