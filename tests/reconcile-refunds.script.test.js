import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config/prisma.ts", () => ({
  prisma: {
    $disconnect: vi.fn(),
  },
}));

vi.mock(
  "../src/modules/payments/payment-refund.reconciliation-batch.js",
  () => ({
    reconciliarReembolsosEmLote: vi.fn(),
  }),
);

import {
  executarReconciliacao,
  iniciarReconciliacao,
} from "../scripts/reconcile-refunds.js";

describe("Executor de reconciliação de reembolsos", () => {
  it("retorna código 0 quando a reconciliação termina sem erros", async () => {
    const reconciliar = vi.fn().mockResolvedValue({
      verificados: 5,
      reembolsados: 2,
      semReembolso: 3,
      naoConfirmados: 0,
      erros: 0,
    });

    const desconectar = vi.fn().mockResolvedValue(undefined);
    const registrarInfo = vi.fn();
    const registrarErro = vi.fn();

    const codigo = await executarReconciliacao({
      reconciliar,
      desconectar,
      registrarInfo,
      registrarErro,
    });

    expect(codigo).toBe(0);
    expect(reconciliar).toHaveBeenCalledOnce();
    expect(desconectar).toHaveBeenCalledOnce();
    expect(registrarErro).not.toHaveBeenCalled();
  });

  it("retorna código 1 quando existem erros individuais", async () => {
    const codigo = await executarReconciliacao({
      reconciliar: vi.fn().mockResolvedValue({
        verificados: 3,
        reembolsados: 1,
        semReembolso: 1,
        naoConfirmados: 0,
        erros: 1,
      }),
      desconectar: vi.fn(),
      registrarInfo: vi.fn(),
      registrarErro: vi.fn(),
    });

    expect(codigo).toBe(1);
  });

  it("não considera bloqueio ocupado como falha", async () => {
    const desconectar = vi.fn();

    const codigo = await executarReconciliacao({
      reconciliar: vi.fn().mockResolvedValue({
        bloqueado: true,
      }),
      desconectar,
      registrarInfo: vi.fn(),
      registrarErro: vi.fn(),
    });

    expect(codigo).toBe(0);
    expect(desconectar).toHaveBeenCalledOnce();
  });

  it("retorna código 1 quando a reconciliação falha", async () => {
    const desconectar = vi.fn();

    const codigo = await executarReconciliacao({
      reconciliar: vi.fn().mockRejectedValue(new Error("Falha simulada")),
      desconectar,
      registrarInfo: vi.fn(),
      registrarErro: vi.fn(),
    });

    expect(codigo).toBe(1);
    expect(desconectar).toHaveBeenCalledOnce();
  });

  it("retorna código 1 quando a desconexão falha", async () => {
    const registrarErro = vi.fn();

    const codigo = await executarReconciliacao({
      reconciliar: vi.fn().mockResolvedValue({
        verificados: 0,
        reembolsados: 0,
        semReembolso: 0,
        naoConfirmados: 0,
        erros: 0,
      }),
      desconectar: vi.fn().mockRejectedValue(new Error("Falha ao desconectar")),
      registrarInfo: vi.fn(),
      registrarErro,
    });

    expect(codigo).toBe(1);
    expect(registrarErro).toHaveBeenCalled();
  });

  it("retorna código 1 se a desconexão falhar após bloqueio ocupado", async () => {
    const registrarErro = vi.fn();

    const codigo = await executarReconciliacao({
      reconciliar: vi.fn().mockResolvedValue({
        bloqueado: true,
      }),
      desconectar: vi
        .fn()
        .mockRejectedValue(new Error("Falha simulada na desconexão")),
      registrarInfo: vi.fn(),
      registrarErro,
    });

    expect(codigo).toBe(1);
    expect(registrarErro).toHaveBeenCalledWith(
      "Falha ao desconectar o Prisma:",
      expect.any(Error),
    );
  });

  it("bloqueia a execução quando não existe autorização", async () => {
    const executar = vi.fn();
    const registrarErro = vi.fn();

    const codigo = await iniciarReconciliacao({
      autorizado: false,
      executar,
      registrarErro,
    });

    expect(codigo).toBe(1);
    expect(executar).not.toHaveBeenCalled();
    expect(registrarErro).toHaveBeenCalledWith(
      expect.stringContaining("Reconciliação desativada"),
    );
  });

  it("permite a execução quando existe autorização explícita", async () => {
    const executar = vi.fn().mockResolvedValue(0);

    const codigo = await iniciarReconciliacao({
      autorizado: true,
      executar,
      registrarErro: vi.fn(),
    });

    expect(codigo).toBe(0);
    expect(executar).toHaveBeenCalledOnce();
  });

  it("propaga o código de erro do executor autorizado", async () => {
    const executar = vi.fn().mockResolvedValue(1);

    const codigo = await iniciarReconciliacao({
      autorizado: true,
      executar,
      registrarErro: vi.fn(),
    });

    expect(codigo).toBe(1);
    expect(executar).toHaveBeenCalledOnce();
  });

  it("registra identificador de conclusão quando não existem erros", async () => {
    const registrarInfo = vi.fn();
    const registrarErro = vi.fn();

    const codigo = await executarReconciliacao({
      reconciliar: vi.fn().mockResolvedValue({
        verificados: 2,
        reembolsados: 1,
        semReembolso: 1,
        naoConfirmados: 0,
        erros: 0,
      }),
      desconectar: vi.fn(),
      registrarInfo,
      registrarErro,
    });

    expect(codigo).toBe(0);
    expect(registrarInfo).toHaveBeenCalledWith(
      "REFUND_RECONCILIATION_COMPLETED",
    );
    expect(registrarErro).not.toHaveBeenCalled();
  });

  it("registra identificador quando a execução é ignorada por bloqueio", async () => {
    const registrarInfo = vi.fn();

    const codigo = await executarReconciliacao({
      reconciliar: vi.fn().mockResolvedValue({
        bloqueado: true,
      }),
      desconectar: vi.fn(),
      registrarInfo,
      registrarErro: vi.fn(),
    });

    expect(codigo).toBe(0);
    expect(registrarInfo).toHaveBeenCalledWith(
      "REFUND_RECONCILIATION_SKIPPED_LOCKED",
    );
  });

  it("registra identificador de falha quando existem erros individuais", async () => {
    const registrarErro = vi.fn();

    const codigo = await executarReconciliacao({
      reconciliar: vi.fn().mockResolvedValue({
        verificados: 2,
        reembolsados: 1,
        semReembolso: 0,
        naoConfirmados: 0,
        erros: 1,
      }),
      desconectar: vi.fn(),
      registrarInfo: vi.fn(),
      registrarErro,
    });

    expect(codigo).toBe(1);
    expect(registrarErro).toHaveBeenCalledWith("REFUND_RECONCILIATION_FAILED");
  });

  it("registra identificador de falha quando a desconexão falha", async () => {
    const registrarErro = vi.fn();

    const codigo = await executarReconciliacao({
      reconciliar: vi.fn().mockResolvedValue({
        verificados: 0,
        reembolsados: 0,
        naoConfirmados: 0,
        semReembolso: 0,
        erros: 0,
      }),
      desconectar: vi
        .fn()
        .mockRejectedValue(new Error("Falha simulada na desconexão")),
      registrarInfo: vi.fn(),
      registrarErro,
    });

    expect(codigo).toBe(1);
    expect(registrarErro).toHaveBeenCalledWith("REFUND_RECONCILIATION_FAILED");
  });
});
