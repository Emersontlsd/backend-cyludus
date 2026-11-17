import { describe, expect, it, vi } from "vitest";

describe("Ponto de entrada da reconciliação", () => {
  it("bloqueia a execução antes de importar o executor financeiro", async () => {
    const executar = vi.fn();

    vi.resetModules();
    vi.stubEnv("ENABLE_REFUND_RECONCILIATION", "false");

    vi.doMock("../scripts/reconcile-refunds.js", () => ({
      iniciarReconciliacao: executar,
    }));

    const registrarErro = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const codigoAnterior = process.exitCode;

    try {
      await import("../scripts/run-reconcile-refunds.js");

      expect(executar).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);

      expect(registrarErro).toHaveBeenCalledWith(
        expect.stringContaining("Reconciliação desativada"),
      );
    } finally {
      process.exitCode = codigoAnterior;
      registrarErro.mockRestore();
      vi.doUnmock("../scripts/reconcile-refunds.js");
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("chama o executor simulado quando existe autorização", async () => {
    const executar = vi.fn().mockResolvedValue(0);

    vi.resetModules();
    vi.stubEnv("ENABLE_REFUND_RECONCILIATION", "true");

    vi.doMock("../scripts/reconcile-refunds.js", () => ({
      iniciarReconciliacao: executar,
    }));

    const codigoAnterior = process.exitCode;

    try {
      await import("../scripts/run-reconcile-refunds.js");

      expect(executar).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(0);
    } finally {
      process.exitCode = codigoAnterior;
      vi.doUnmock("../scripts/reconcile-refunds.js");
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
