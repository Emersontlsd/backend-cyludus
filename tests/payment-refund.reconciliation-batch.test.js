import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    payment: {
      findMany: vi.fn(),
    },
  },
  reconciliarReembolsoPagamento: vi.fn(),
}));

vi.mock("../src/config/prisma.ts", () => ({
  prisma: mocks.prisma,
}));

vi.mock("../src/modules/payments/payment-refund.reconciliation.js", () => ({
  reconciliarReembolsoPagamento: mocks.reconciliarReembolsoPagamento,
}));

import { reconciliarReembolsosEmLote } from "../src/modules/payments/payment-refund.reconciliation-batch.js";

describe("Reconciliação de reembolsos em lotes", () => {
  const criarPagamento = (id) => ({
    id,
    status: "APPROVED",
    provider: "MERCADO_PAGO",
    providerOrderId: `order-${id}`,
    providerPaymentId: `provider-${id}`,
  });

  let db;
  let reconciliarPagamento;
  let registrarErro;

  beforeEach(() => {
    vi.resetAllMocks();

    db = {
      payment: {
        findMany: vi.fn(),
      },
      reconciliationCursor: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue({ lastId: null }),
      },
    };

    reconciliarPagamento = vi.fn();
    registrarErro = vi.fn();
  });

  it("retorna resumo vazio quando não há pagamentos", async () => {
    db.payment.findMany.mockResolvedValue([]);

    const resultado = await reconciliarReembolsosEmLote({
      db,
      reconciliarPagamento,
      registrarErro,
    });

    expect(resultado).toEqual({
      verificados: 0,
      reembolsados: 0,
      semReembolso: 0,
      naoConfirmados: 0,
      erros: 0,
    });

    expect(reconciliarPagamento).not.toHaveBeenCalled();
  });

  it("classifica os resultados da reconciliação", async () => {
    const pagamentos = [
      criarPagamento("001"),
      criarPagamento("002"),
      criarPagamento("003"),
    ];

    db.payment.findMany.mockResolvedValue(pagamentos);

    reconciliarPagamento
      .mockResolvedValueOnce({
        reconciled: true,
      })
      .mockResolvedValueOnce({
        reconciled: false,
        refundStatus: "NO_REFUND",
      })
      .mockResolvedValueOnce({
        reconciled: false,
        refundStatus: "NOT_FULLY_CONFIRMED",
      });

    const resultado = await reconciliarReembolsosEmLote({
      db,
      reconciliarPagamento,
      registrarErro,
    });

    expect(resultado).toEqual({
      verificados: 3,
      reembolsados: 1,
      semReembolso: 1,
      naoConfirmados: 1,
      erros: 0,
    });

    expect(reconciliarPagamento).toHaveBeenCalledTimes(3);
  });

  it("continua processando após erro individual", async () => {
    db.payment.findMany.mockResolvedValue([
      criarPagamento("001"),
      criarPagamento("002"),
    ]);

    reconciliarPagamento
      .mockRejectedValueOnce(new Error("Falha no Mercado Pago"))
      .mockResolvedValueOnce({
        reconciled: true,
      });

    const resultado = await reconciliarReembolsosEmLote({
      db,
      reconciliarPagamento,
      registrarErro,
    });

    expect(resultado.verificados).toBe(2);
    expect(resultado.reembolsados).toBe(1);
    expect(resultado.erros).toBe(1);
    expect(registrarErro).toHaveBeenCalledTimes(1);
  });

  it("respeita o limite máximo informado", async () => {
    db.payment.findMany.mockResolvedValue([
      criarPagamento("001"),
      criarPagamento("002"),
    ]);

    reconciliarPagamento.mockResolvedValue({
      reconciled: false,
      refundStatus: "NO_REFUND",
    });

    const resultado = await reconciliarReembolsosEmLote({
      limite: 2,
      db,
      reconciliarPagamento,
      registrarErro,
    });

    expect(resultado.verificados).toBe(2);
    expect(db.payment.findMany).toHaveBeenCalledTimes(1);

    expect(db.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
      }),
    );
  });

  it("utiliza paginação por ID sem skip", async () => {
    const primeiraPagina = Array.from({ length: 50 }, (_, indice) =>
      criarPagamento(String(indice + 1).padStart(3, "0")),
    );

    db.payment.findMany
      .mockResolvedValueOnce(primeiraPagina)
      .mockResolvedValueOnce([criarPagamento("051")]);

    reconciliarPagamento.mockResolvedValue({
      reconciled: false,
      refundStatus: "NO_REFUND",
    });

    const resultado = await reconciliarReembolsosEmLote({
      limite: 100,
      db,
      reconciliarPagamento,
      registrarErro,
    });

    expect(resultado.verificados).toBe(51);

    expect(db.payment.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: {
            gt: "050",
          },
        }),
        orderBy: {
          id: "asc",
        },
      }),
    );
  });

  it("rejeita limites inválidos", async () => {
    for (const limite of [0, -1, 1.5, 501, "100"]) {
      await expect(
        reconciliarReembolsosEmLote({
          limite,
          db,
          reconciliarPagamento,
          registrarErro,
        }),
      ).rejects.toThrow("O limite deve ser um número inteiro entre 1 e 500.");
    }

    expect(db.payment.findMany).not.toHaveBeenCalled();
  });

  it("propaga falha na consulta ao banco", async () => {
    const erro = new Error("Banco indisponível");

    db.payment.findMany.mockRejectedValue(erro);

    await expect(
      reconciliarReembolsosEmLote({
        db,
        reconciliarPagamento,
        registrarErro,
      }),
    ).rejects.toBe(erro);
  });

  it("contabiliza resultados inesperados como erro", async () => {
    db.payment.findMany.mockResolvedValue([criarPagamento("001")]);

    reconciliarPagamento.mockResolvedValue({
      reconciled: false,
      refundStatus: "UNKNOWN",
    });

    const resultado = await reconciliarReembolsosEmLote({
      db,
      reconciliarPagamento,
      registrarErro,
    });

    expect(resultado.erros).toBe(1);
    expect(registrarErro).toHaveBeenCalledTimes(1);
  });

  it("não processa pagamentos quando outra execução possui o bloqueio", async () => {
    db.reconciliationCursor.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    const resultado = await reconciliarReembolsosEmLote({
      db,
      reconciliarPagamento,
      registrarErro,
    });

    expect(resultado).toEqual({
      verificados: 0,
      reembolsados: 0,
      semReembolso: 0,
      naoConfirmados: 0,
      erros: 0,
      bloqueado: true,
    });

    expect(db.payment.findMany).not.toHaveBeenCalled();
    expect(reconciliarPagamento).not.toHaveBeenCalled();

    expect(db.reconciliationCursor.findFirst).not.toHaveBeenCalled();
  });

  it("retoma a reconciliação a partir do cursor persistido", async () => {
    db.reconciliationCursor.findFirst.mockResolvedValueOnce({
      lastId: "050",
    });

    db.payment.findMany.mockResolvedValueOnce([
      criarPagamento("051"),
      criarPagamento("052"),
    ]);

    reconciliarPagamento.mockResolvedValue({
      reconciled: false,
      refundStatus: "NO_REFUND",
    });

    const resultado = await reconciliarReembolsosEmLote({
      limite: 2,
      db,
      reconciliarPagamento,
      registrarErro,
    });

    expect(resultado.verificados).toBe(2);

    expect(db.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: {
            gt: "050",
          },
        }),
        orderBy: {
          id: "asc",
        },
        take: 2,
      }),
    );

    expect(reconciliarPagamento).toHaveBeenCalledTimes(2);

    expect(db.reconciliationCursor.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          lastId: "052",
        },
      }),
    );
  });

  it("reinicia o cursor ao alcançar o final da varredura", async () => {
    db.reconciliationCursor.findFirst.mockResolvedValueOnce({
      lastId: "050",
    });

    db.payment.findMany.mockResolvedValueOnce([
      criarPagamento("051"),
      criarPagamento("052"),
    ]);

    reconciliarPagamento.mockResolvedValue({
      reconciled: false,
      refundStatus: "NO_REFUND",
    });

    const resultado = await reconciliarReembolsosEmLote({
      limite: 10,
      db,
      reconciliarPagamento,
      registrarErro,
    });

    expect(resultado.verificados).toBe(2);
    expect(resultado.semReembolso).toBe(2);

    expect(db.reconciliationCursor.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          lastId: "052",
        },
      }),
    );

    expect(db.reconciliationCursor.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          lastId: null,
        },
      }),
    );

    expect(reconciliarPagamento).toHaveBeenCalledTimes(2);
  });

  it("interrompe o lote quando perde o bloqueio durante a reconciliação", async () => {
    db.payment.findMany.mockResolvedValueOnce([
      criarPagamento("001"),
      criarPagamento("002"),
    ]);

    let resolverPagamento;
    let avisarInicio;

    const pagamentoIniciado = new Promise((resolve) => {
      avisarInicio = resolve;
    });

    const pagamentoPendente = new Promise((resolve) => {
      resolverPagamento = resolve;
    });

    reconciliarPagamento.mockImplementationOnce(async () => {
      avisarInicio();

      return pagamentoPendente;
    });

    const execucao = reconciliarReembolsosEmLote({
      limite: 2,
      db,
      reconciliarPagamento,
      registrarErro,
    });

    await pagamentoIniciado;

    // Simula a perda do bloqueio na próxima verificação.
    db.reconciliationCursor.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    resolverPagamento({
      reconciled: false,
      refundStatus: "NO_REFUND",
    });

    await expect(execucao).rejects.toThrow(
      "O bloqueio de reconciliação foi perdido.",
    );

    expect(reconciliarPagamento).toHaveBeenCalledTimes(1);

    const atualizacoesCursor =
      db.reconciliationCursor.updateMany.mock.calls.filter(([argumentos]) =>
        Object.prototype.hasOwnProperty.call(argumentos.data, "lastId"),
      );

    expect(atualizacoesCursor).toHaveLength(0);
  });

  it("preserva o erro original quando a liberação do bloqueio também falha", async () => {
    const erroOriginal = new Error("Falha na consulta ao banco");
    const erroLiberacao = new Error("Falha ao liberar bloqueio");

    db.payment.findMany.mockRejectedValueOnce(erroOriginal);

    db.reconciliationCursor.updateMany.mockImplementation(async ({ data }) => {
      if (
        Object.prototype.hasOwnProperty.call(data, "lockedBy") &&
        data.lockedBy === null
      ) {
        throw erroLiberacao;
      }

      return { count: 1 };
    });

    await expect(
      reconciliarReembolsosEmLote({
        db,
        reconciliarPagamento,
        registrarErro,
      }),
    ).rejects.toBe(erroOriginal);

    expect(registrarErro).toHaveBeenCalledWith(
      "Falha adicional ao finalizar a reconciliação:",
      erroLiberacao,
    );
  });

  it("renova automaticamente o bloqueio durante uma reconciliação demorada", async () => {
    vi.useFakeTimers();

    try {
      db.payment.findMany.mockResolvedValueOnce([criarPagamento("001")]);

      let avisarInicio;
      let concluirPagamento;

      const pagamentoIniciado = new Promise((resolve) => {
        avisarInicio = resolve;
      });

      const pagamentoPendente = new Promise((resolve) => {
        concluirPagamento = resolve;
      });

      reconciliarPagamento.mockImplementationOnce(async () => {
        avisarInicio();
        return pagamentoPendente;
      });

      const execucao = reconciliarReembolsosEmLote({
        limite: 1,
        db,
        reconciliarPagamento,
        registrarErro,
      });

      await pagamentoIniciado;

      const renovacoesAntes =
        db.reconciliationCursor.updateMany.mock.calls.filter(
          ([argumentos]) =>
            Object.prototype.hasOwnProperty.call(
              argumentos.data,
              "lockedUntil",
            ) &&
            !Object.prototype.hasOwnProperty.call(argumentos.data, "lockedBy"),
        ).length;

      await vi.advanceTimersByTimeAsync(60_000);

      const renovacoesDepois =
        db.reconciliationCursor.updateMany.mock.calls.filter(
          ([argumentos]) =>
            Object.prototype.hasOwnProperty.call(
              argumentos.data,
              "lockedUntil",
            ) &&
            !Object.prototype.hasOwnProperty.call(argumentos.data, "lockedBy"),
        ).length;

      expect(renovacoesDepois).toBeGreaterThan(renovacoesAntes);

      concluirPagamento({
        reconciled: false,
        refundStatus: "NO_REFUND",
      });

      const resultado = await execucao;

      expect(resultado.verificados).toBe(1);
      expect(resultado.semReembolso).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("interrompe o lote quando o heartbeat perde o bloqueio", async () => {
    vi.useFakeTimers();

    try {
      db.payment.findMany.mockResolvedValueOnce([
        criarPagamento("001"),
        criarPagamento("002"),
      ]);

      let avisarInicio;
      let concluirPagamento;

      const pagamentoIniciado = new Promise((resolve) => {
        avisarInicio = resolve;
      });

      const pagamentoPendente = new Promise((resolve) => {
        concluirPagamento = resolve;
      });

      reconciliarPagamento.mockImplementationOnce(async () => {
        avisarInicio();
        return pagamentoPendente;
      });

      const execucao = reconciliarReembolsosEmLote({
        limite: 2,
        db,
        reconciliarPagamento,
        registrarErro,
      });

      await pagamentoIniciado;

      // A próxima renovação automática perde o bloqueio.
      db.reconciliationCursor.updateMany.mockResolvedValueOnce({
        count: 0,
      });

      await vi.advanceTimersByTimeAsync(60_000);

      concluirPagamento({
        reconciled: false,
        refundStatus: "NO_REFUND",
      });

      await expect(execucao).rejects.toThrow(
        "O bloqueio de reconciliação foi perdido.",
      );

      expect(reconciliarPagamento).toHaveBeenCalledTimes(1);

      const atualizacoesCursor =
        db.reconciliationCursor.updateMany.mock.calls.filter(([argumentos]) =>
          Object.prototype.hasOwnProperty.call(argumentos.data, "lastId"),
        );

      expect(atualizacoesCursor).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("interrompe o lote quando a renovação automática falha no banco", async () => {
    vi.useFakeTimers();

    try {
      db.payment.findMany.mockResolvedValueOnce([
        criarPagamento("001"),
        criarPagamento("002"),
      ]);

      let avisarInicio;
      let concluirPagamento;

      const pagamentoIniciado = new Promise((resolve) => {
        avisarInicio = resolve;
      });

      const pagamentoPendente = new Promise((resolve) => {
        concluirPagamento = resolve;
      });

      reconciliarPagamento.mockImplementationOnce(async () => {
        avisarInicio();
        return pagamentoPendente;
      });

      const execucao = reconciliarReembolsosEmLote({
        limite: 2,
        db,
        reconciliarPagamento,
        registrarErro,
      });

      await pagamentoIniciado;

      const erroBanco = new Error("Falha de conexão durante a renovação");

      db.reconciliationCursor.updateMany.mockRejectedValueOnce(erroBanco);

      await vi.advanceTimersByTimeAsync(60_000);

      concluirPagamento({
        reconciled: false,
        refundStatus: "NO_REFUND",
      });

      await expect(execucao).rejects.toBe(erroBanco);

      expect(reconciliarPagamento).toHaveBeenCalledTimes(1);

      const atualizacoesCursor =
        db.reconciliationCursor.updateMany.mock.calls.filter(([argumentos]) =>
          Object.prototype.hasOwnProperty.call(argumentos.data, "lastId"),
        );

      expect(atualizacoesCursor).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("compartilha a renovação pendente entre heartbeat e verificação manual", async () => {
    vi.useFakeTimers();

    try {
      db.payment.findMany.mockResolvedValueOnce([criarPagamento("001")]);

      let avisarInicio;
      let concluirPagamento;
      let concluirRenovacao;

      const pagamentoIniciado = new Promise((resolve) => {
        avisarInicio = resolve;
      });

      const pagamentoPendente = new Promise((resolve) => {
        concluirPagamento = resolve;
      });

      const renovacaoPendente = new Promise((resolve) => {
        concluirRenovacao = resolve;
      });

      reconciliarPagamento.mockImplementationOnce(async () => {
        avisarInicio();
        return pagamentoPendente;
      });

      const execucao = reconciliarReembolsosEmLote({
        limite: 1,
        db,
        reconciliarPagamento,
        registrarErro,
      });

      await pagamentoIniciado;

      // O heartbeat inicia uma renovação que permanece pendente.
      db.reconciliationCursor.updateMany.mockImplementationOnce(
        () => renovacaoPendente,
      );

      await vi.advanceTimersByTimeAsync(60_000);

      // O pagamento termina enquanto a renovação está pendente.
      concluirPagamento({
        reconciled: false,
        refundStatus: "NO_REFUND",
      });

      // Permite que a verificação manual alcance a renovação pendente.
      await Promise.resolve();
      await Promise.resolve();

      const renovacoesAntesDeConcluir =
        db.reconciliationCursor.updateMany.mock.calls.filter(
          ([argumentos]) =>
            Object.prototype.hasOwnProperty.call(
              argumentos.data,
              "lockedUntil",
            ) &&
            !Object.prototype.hasOwnProperty.call(argumentos.data, "lockedBy"),
        );

      // Uma renovação inicial e uma do heartbeat.
      // A verificação manual não deve iniciar uma terceira.
      expect(renovacoesAntesDeConcluir).toHaveLength(2);

      concluirRenovacao({ count: 1 });

      const resultado = await execucao;

      expect(resultado.verificados).toBe(1);
      expect(resultado.semReembolso).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
