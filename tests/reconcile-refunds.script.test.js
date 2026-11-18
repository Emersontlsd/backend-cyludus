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

  it("registra JSON estruturado quando a reconciliação termina com sucesso", async () => {
    const registrarInfo = vi.fn();

    const resumo = {
      verificados: 5,
      reembolsados: 2,
      semReembolso: 3,
      naoConfirmados: 0,
      erros: 0,
    };

    const codigo = await executarReconciliacao({
      reconciliar: vi.fn().mockResolvedValue(resumo),
      desconectar: vi.fn(),
      registrarInfo,
      registrarErro: vi.fn(),
    });

    const registros = registrarInfo.mock.calls
      .filter(([mensagem]) => typeof mensagem === "string")
      .map(([mensagem]) => {
        try {
          return JSON.parse(mensagem);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    expect(codigo).toBe(0);

    expect(registros).toContainEqual({
      executionId: expect.any(String),
      event: "REFUND_RECONCILIATION_COMPLETED",
      status: "SUCCESS",
      exitCode: 0,
      timestamp: expect.any(String),
      summary: {
        verificados: 5,
        reembolsados: 2,
        semReembolso: 3,
        naoConfirmados: 0,
        erros: 0,
      },
    });

    expect(Number.isNaN(Date.parse(registros[0].timestamp))).toBe(false);
  });

  it("registra JSON estruturado quando o bloqueio está ocupado", async () => {
    const registrarInfo = vi.fn();

    const codigo = await executarReconciliacao({
      reconciliar: vi.fn().mockResolvedValue({ bloqueado: true }),
      desconectar: vi.fn(),
      registrarInfo,
      registrarErro: vi.fn(),
    });

    const registro = registrarInfo.mock.calls
      .map(([mensagem]) => {
        try {
          return JSON.parse(mensagem);
        } catch {
          return null;
        }
      })
      .find((valor) => valor?.event === "REFUND_RECONCILIATION_SKIPPED_LOCKED");

    expect(codigo).toBe(0);
    expect(registro).toMatchObject({
      event: "REFUND_RECONCILIATION_SKIPPED_LOCKED",
      status: "SKIPPED",
      exitCode: 0,
    });
  });

  it("registra JSON estruturado quando existem erros individuais", async () => {
    const registrarErro = vi.fn();

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
      registrarErro,
    });

    const registro = registrarErro.mock.calls
      .map(([mensagem]) => {
        try {
          return JSON.parse(mensagem);
        } catch {
          return null;
        }
      })
      .find((valor) => valor?.event === "REFUND_RECONCILIATION_FAILED");

    expect(codigo).toBe(1);
    expect(registro).toMatchObject({
      event: "REFUND_RECONCILIATION_FAILED",
      status: "FAILED",
      exitCode: 1,
      summary: {
        verificados: 3,
        erros: 1,
      },
    });
  });

  it("registra JSON estruturado quando a reconciliação lança exceção", async () => {
    const registrarErro = vi.fn();

    const codigo = await executarReconciliacao({
      reconciliar: vi.fn().mockRejectedValue(new Error("Falha simulada")),
      desconectar: vi.fn(),
      registrarInfo: vi.fn(),
      registrarErro,
    });

    const registro = registrarErro.mock.calls
      .map(([mensagem]) => {
        try {
          return JSON.parse(mensagem);
        } catch {
          return null;
        }
      })
      .find((valor) => valor?.event === "REFUND_RECONCILIATION_FAILED");

    expect(codigo).toBe(1);
    expect(registro).toMatchObject({
      event: "REFUND_RECONCILIATION_FAILED",
      status: "FAILED",
      exitCode: 1,
      summary: null,
    });
  });

  it("emite exatamente um alerta INFO após conclusão", async () => {
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

    const alertas = registrarInfo.mock.calls
      .map(([mensagem]) => {
        try {
          return JSON.parse(mensagem);
        } catch {
          return null;
        }
      })
      .filter((registro) => registro?.source === "refund-reconciliation");

    expect(codigo).toBe(0);
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      event: "REFUND_RECONCILIATION_COMPLETED",
      severity: "INFO",
      requiresAttention: false,
    });
    expect(registrarErro).not.toHaveBeenCalled();
  });

  it("emite exatamente um alerta WARNING para bloqueio ocupado", async () => {
    const registrarInfo = vi.fn();

    const codigo = await executarReconciliacao({
      reconciliar: vi.fn().mockResolvedValue({ bloqueado: true }),
      desconectar: vi.fn(),
      registrarInfo,
      registrarErro: vi.fn(),
    });

    const alertas = registrarInfo.mock.calls
      .map(([mensagem]) => {
        try {
          return JSON.parse(mensagem);
        } catch {
          return null;
        }
      })
      .filter((registro) => registro?.source === "refund-reconciliation");

    expect(codigo).toBe(0);
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      event: "REFUND_RECONCILIATION_SKIPPED_LOCKED",
      severity: "WARNING",
      requiresAttention: true,
    });
  });

  it("emite alerta ERROR para erros individuais", async () => {
    const registrarErro = vi.fn();

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
      registrarErro,
    });

    const alertas = registrarErro.mock.calls
      .map(([mensagem]) => {
        try {
          return JSON.parse(mensagem);
        } catch {
          return null;
        }
      })
      .filter((registro) => registro?.source === "refund-reconciliation");

    expect(codigo).toBe(1);
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      event: "REFUND_RECONCILIATION_FAILED",
      severity: "ERROR",
      requiresAttention: true,
    });
  });

  it("emite alerta ERROR quando ocorre exceção", async () => {
    const registrarErro = vi.fn();

    const codigo = await executarReconciliacao({
      reconciliar: vi.fn().mockRejectedValue(new Error("Falha simulada")),
      desconectar: vi.fn(),
      registrarInfo: vi.fn(),
      registrarErro,
    });

    const alertas = registrarErro.mock.calls
      .map(([mensagem]) => {
        try {
          return JSON.parse(mensagem);
        } catch {
          return null;
        }
      })
      .filter((registro) => registro?.source === "refund-reconciliation");

    expect(codigo).toBe(1);
    expect(alertas).toHaveLength(1);
    expect(alertas[0].severity).toBe("ERROR");
  });

  it("preserva código 0 quando o registro do alerta INFO falha", async () => {
    const reconciliar = vi.fn().mockResolvedValue({
      verificados: 1,
      reembolsados: 0,
      semReembolso: 1,
      naoConfirmados: 0,
      erros: 0,
    });

    const registrarInfo = vi.fn((mensagem) => {
      if (
        typeof mensagem === "string" &&
        mensagem.includes('"source":"refund-reconciliation"')
      ) {
        throw new Error("Falha simulada no registro do alerta");
      }
    });

    const codigo = await executarReconciliacao({
      reconciliar,
      desconectar: vi.fn(),
      registrarInfo,
      registrarErro: vi.fn(),
    });

    expect(codigo).toBe(0);
    expect(reconciliar).toHaveBeenCalledOnce();
  });

  it("preserva código 1 quando o registro do alerta ERROR falha", async () => {
    const reconciliar = vi
      .fn()
      .mockRejectedValue(new Error("Falha simulada na reconciliação"));

    const registrarErro = vi.fn((mensagem) => {
      if (
        typeof mensagem === "string" &&
        mensagem.includes('"source":"refund-reconciliation"')
      ) {
        throw new Error("Falha simulada no registro do alerta");
      }
    });

    const codigo = await executarReconciliacao({
      reconciliar,
      desconectar: vi.fn(),
      registrarInfo: vi.fn(),
      registrarErro,
    });

    expect(codigo).toBe(1);
    expect(reconciliar).toHaveBeenCalledOnce();
  });

  it("não executa reconciliação quando a autorização está desativada", async () => {
    const executar = vi.fn();
    const registrarErro = vi.fn();

    const codigo = await iniciarReconciliacao({
      autorizado: false,
      executar,
      registrarErro,
    });

    expect(codigo).toBe(1);
    expect(executar).not.toHaveBeenCalled();
    expect(registrarErro).toHaveBeenCalledOnce();
  });

  it("compartilha o mesmo executionId entre evento e alerta", async () => {
    const registrarInfo = vi.fn();

    const codigo = await executarReconciliacao({
      reconciliar: vi.fn().mockResolvedValue({
        verificados: 1,
        reembolsados: 0,
        semReembolso: 1,
        naoConfirmados: 0,
        erros: 0,
      }),
      desconectar: vi.fn(),
      registrarInfo,
      registrarErro: vi.fn(),
    });

    const registros = registrarInfo.mock.calls
      .map(([mensagem]) => {
        try {
          return JSON.parse(mensagem);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const evento = registros.find(
      (registro) =>
        registro.event === "REFUND_RECONCILIATION_COMPLETED" &&
        registro.status === "SUCCESS",
    );

    const alerta = registros.find(
      (registro) => registro.source === "refund-reconciliation",
    );

    expect(codigo).toBe(0);
    expect(evento).toBeDefined();
    expect(alerta).toBeDefined();

    expect(evento.executionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    expect(alerta.executionId).toBe(evento.executionId);
  });

  it("gera executionIds diferentes para execuções distintas", async () => {
    const registrarInfo = vi.fn();

    const reconciliar = vi.fn().mockResolvedValue({
      verificados: 1,
      reembolsados: 0,
      semReembolso: 1,
      naoConfirmados: 0,
      erros: 0,
    });

    for (let i = 0; i < 2; i++) {
      await executarReconciliacao({
        reconciliar,
        desconectar: vi.fn(),
        registrarInfo,
        registrarErro: vi.fn(),
      });
    }

    const eventos = registrarInfo.mock.calls
      .map(([mensagem]) => {
        try {
          return JSON.parse(mensagem);
        } catch {
          return null;
        }
      })
      .filter(
        (registro) =>
          registro?.event === "REFUND_RECONCILIATION_COMPLETED" &&
          registro?.status === "SUCCESS",
      );

    expect(eventos).toHaveLength(2);
    expect(eventos[0].executionId).toBeTruthy();
    expect(eventos[1].executionId).toBeTruthy();
    expect(eventos[0].executionId).not.toBe(eventos[1].executionId);
    expect(reconciliar).toHaveBeenCalledTimes(2);
  });

  it("preserva executionId quando o bloqueio está ocupado", async () => {
    const registrarInfo = vi.fn();

    const codigo = await executarReconciliacao({
      reconciliar: vi.fn().mockResolvedValue({
        bloqueado: true,
        verificados: 0,
        reembolsados: 0,
        semReembolso: 0,
        naoConfirmados: 0,
        erros: 0,
      }),
      desconectar: vi.fn(),
      registrarInfo,
      registrarErro: vi.fn(),
    });

    const registros = registrarInfo.mock.calls
      .map(([mensagem]) => {
        try {
          return JSON.parse(mensagem);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const evento = registros.find(
      (registro) =>
        registro.event === "REFUND_RECONCILIATION_SKIPPED_LOCKED" &&
        registro.status === "SKIPPED",
    );

    const alerta = registros.find(
      (registro) => registro.source === "refund-reconciliation",
    );

    expect(codigo).toBe(0);
    expect(evento).toBeDefined();
    expect(alerta).toBeDefined();
    expect(alerta.severity).toBe("WARNING");
    expect(alerta.executionId).toBe(evento.executionId);
  });

  it("preserva executionId quando a reconciliação falha", async () => {
    const registrarErro = vi.fn();

    const codigo = await executarReconciliacao({
      reconciliar: vi.fn().mockRejectedValue(new Error("Falha simulada")),
      desconectar: vi.fn(),
      registrarInfo: vi.fn(),
      registrarErro,
    });

    const registros = registrarErro.mock.calls
      .map(([mensagem]) => {
        try {
          return JSON.parse(mensagem);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const evento = registros.find(
      (registro) =>
        registro.event === "REFUND_RECONCILIATION_FAILED" &&
        registro.status === "FAILED",
    );

    const alerta = registros.find(
      (registro) => registro.source === "refund-reconciliation",
    );

    expect(codigo).toBe(1);
    expect(evento).toBeDefined();
    expect(alerta).toBeDefined();
    expect(alerta.severity).toBe("ERROR");
    expect(alerta.executionId).toBe(evento.executionId);
  });

  it("preserva executionId quando a desconexão do Prisma falha", async () => {
    const registrarErro = vi.fn();

    const codigo = await executarReconciliacao({
      reconciliar: vi.fn().mockResolvedValue({
        verificados: 1,
        reembolsados: 0,
        semReembolso: 1,
        naoConfirmados: 0,
        erros: 0,
      }),
      desconectar: vi
        .fn()
        .mockRejectedValue(new Error("Falha simulada na desconexão")),
      registrarInfo: vi.fn(),
      registrarErro,
    });

    const registros = registrarErro.mock.calls
      .map(([mensagem]) => {
        try {
          return JSON.parse(mensagem);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const evento = registros.find(
      (registro) =>
        registro.event === "REFUND_RECONCILIATION_FAILED" &&
        registro.status === "FAILED",
    );

    const alerta = registros.find(
      (registro) => registro.source === "refund-reconciliation",
    );

    expect(codigo).toBe(1);
    expect(evento).toBeDefined();
    expect(alerta).toBeDefined();
    expect(alerta.severity).toBe("ERROR");
    expect(alerta.executionId).toBe(evento.executionId);
  });
});
