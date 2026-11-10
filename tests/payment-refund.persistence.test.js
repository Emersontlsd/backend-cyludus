import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  registrarOcorrenciaFinanceira: vi.fn(),
}));

vi.mock("../src/config/prisma.ts", () => ({
  prisma: {
    $transaction: vi.fn(async (callback) => {
      return callback({
        payment: {
          findUnique: mocks.findUnique,
          updateMany: mocks.updateMany,
        },
      });
    }),
  },
}));

vi.mock("../src/modules/payments/payment-incident.service.js", () => ({
  registrarOcorrenciaFinanceira: mocks.registrarOcorrenciaFinanceira,
}));

import { registrarPagamentoReembolsado } from "../src/modules/payments/payment-refund.persistence.js";

describe("Persistência de reembolso confirmado", () => {
  const pagamento = {
    id: "pagamento-123",
    enrollmentId: "inscricao-456",
    providerOrderId: "order-789",
    providerPaymentId: "987654",
  };

  const agora = new Date("2026-11-09T12:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.findUnique.mockResolvedValue({
      ...pagamento,
      status: "APPROVED",
      refundedAt: null,
    });

    mocks.updateMany.mockResolvedValue({
      count: 1,
    });

    mocks.registrarOcorrenciaFinanceira.mockResolvedValue({
      incident: {
        id: "incidente-123",
        type: "PAYMENT_REFUNDED",
        status: "OPEN",
      },
      alreadyExists: false,
    });
  });

  it("atualiza o pagamento e registra a ocorrência financeira", async () => {
    const resultado = await registrarPagamentoReembolsado({
      pagamento,
      providerPaymentId: "987654",
      agora,
    });

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: "pagamento-123",
        enrollmentId: "inscricao-456",
        providerOrderId: "order-789",
        providerPaymentId: "987654",
        status: "APPROVED",
      },
      data: {
        status: "REFUNDED",
        refundedAt: agora,
      },
    });

    expect(mocks.registrarOcorrenciaFinanceira).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: "pagamento-123",
        type: "PAYMENT_REFUNDED",
        providerPaymentId: "987654",
      }),
    );

    expect(resultado).toEqual({
      paymentStatus: "REFUNDED",
      incidentType: "PAYMENT_REFUNDED",
      alreadyProcessed: false,
    });
  });

  it("não atualiza novamente um pagamento já reembolsado", async () => {
    mocks.findUnique.mockResolvedValue({
      ...pagamento,
      status: "REFUNDED",
      refundedAt: agora,
    });

    mocks.registrarOcorrenciaFinanceira.mockResolvedValue({
      incident: {
        id: "incidente-123",
        type: "PAYMENT_REFUNDED",
        status: "OPEN",
      },
      alreadyExists: true,
    });

    const resultado = await registrarPagamentoReembolsado({
      pagamento,
      providerPaymentId: "987654",
      agora,
    });

    expect(mocks.updateMany).not.toHaveBeenCalled();

    expect(mocks.registrarOcorrenciaFinanceira).toHaveBeenCalledTimes(1);

    expect(resultado).toEqual({
      paymentStatus: "REFUNDED",
      incidentType: "PAYMENT_REFUNDED",
      alreadyProcessed: true,
      incidentAlreadyExists: true,
    });
  });

  it("rejeita pagamento que ainda está pendente", async () => {
    mocks.findUnique.mockResolvedValue({
      ...pagamento,
      status: "PENDING",
    });

    await expect(
      registrarPagamentoReembolsado({
        pagamento,
        providerPaymentId: "987654",
        agora,
      }),
    ).rejects.toThrow("O pagamento não está disponível para reembolso.");

    expect(mocks.updateMany).not.toHaveBeenCalled();

    expect(mocks.registrarOcorrenciaFinanceira).not.toHaveBeenCalled();
  });

  it("rejeita quando a atualização do pagamento não afeta registros", async () => {
    mocks.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      registrarPagamentoReembolsado({
        pagamento,
        providerPaymentId: "987654",
        agora,
      }),
    ).rejects.toThrow("O pagamento não está disponível para atualização.");

    expect(mocks.registrarOcorrenciaFinanceira).not.toHaveBeenCalled();
  });

  it("propaga erro quando o registro da ocorrência financeira falha", async () => {
    mocks.registrarOcorrenciaFinanceira.mockRejectedValue(
      new Error("Falha ao registrar ocorrência financeira."),
    );

    await expect(
      registrarPagamentoReembolsado({
        pagamento,
        providerPaymentId: "987654",
        agora,
      }),
    ).rejects.toThrow("Falha ao registrar ocorrência financeira.");

    expect(mocks.updateMany).toHaveBeenCalledTimes(1);

    expect(mocks.registrarOcorrenciaFinanceira).toHaveBeenCalledTimes(1);
  });

  it("recupera ocorrência ausente sem alterar o pagamento", async () => {
    mocks.findUnique.mockResolvedValue({
      ...pagamento,
      status: "REFUNDED",
      refundedAt: agora,
    });

    mocks.registrarOcorrenciaFinanceira.mockResolvedValue({
      incident: {
        id: "incidente-recuperado",
        type: "PAYMENT_REFUNDED",
        status: "OPEN",
      },
      alreadyExists: false,
    });

    const resultado = await registrarPagamentoReembolsado({
      pagamento,
      providerPaymentId: "987654",
      agora,
    });

    expect(mocks.updateMany).not.toHaveBeenCalled();

    expect(mocks.registrarOcorrenciaFinanceira).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: "pagamento-123",
        type: "PAYMENT_REFUNDED",
        providerPaymentId: "987654",
      }),
    );

    expect(resultado).toEqual({
      paymentStatus: "REFUNDED",
      incidentType: "PAYMENT_REFUNDED",
      alreadyProcessed: true,
      incidentAlreadyExists: false,
    });
  });

  it("não altera a matrícula ao registrar um reembolso", async () => {
    const resultado = await registrarPagamentoReembolsado({
      pagamento,
      providerPaymentId: "987654",
      agora,
    });

    expect(mocks.updateMany).toHaveBeenCalledTimes(1);

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: "REFUNDED",
          refundedAt: agora,
        },
      }),
    );

    expect(mocks.registrarOcorrenciaFinanceira).toHaveBeenCalledTimes(1);

    expect(resultado.paymentStatus).toBe("REFUNDED");
  });

  it("propaga falha da ocorrência injetada após atualizar o pagamento", async () => {
    const falhaOcorrencia = vi
      .fn()
      .mockRejectedValue(
        new Error("Falha controlada na ocorrência financeira."),
      );

    await expect(
      registrarPagamentoReembolsado({
        pagamento,
        providerPaymentId: "987654",
        agora,
        registrarOcorrencia: falhaOcorrencia,
      }),
    ).rejects.toThrow("Falha controlada na ocorrência financeira.");

    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(falhaOcorrencia).toHaveBeenCalledTimes(1);
  });
});
