
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
});
