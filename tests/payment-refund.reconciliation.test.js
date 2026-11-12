import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consultarOrderMercadoPago: vi.fn(),
  consultarPagamentoMercadoPago: vi.fn(),
  validarReembolsoTotalMercadoPago: vi.fn(),
  registrarPagamentoReembolsado: vi.fn(),
}));

vi.mock("../src/modules/payments/mercadopago-order.service.js", () => ({
  consultarOrderMercadoPago: mocks.consultarOrderMercadoPago,
  consultarPagamentoMercadoPago: mocks.consultarPagamentoMercadoPago,
}));

vi.mock("../src/modules/payments/payment-refund.validation.js", () => ({
  validarReembolsoTotalMercadoPago: mocks.validarReembolsoTotalMercadoPago,
}));

vi.mock("../src/modules/payments/payment-refund.persistence.js", () => ({
  registrarPagamentoReembolsado: mocks.registrarPagamentoReembolsado,
}));

import { reconciliarReembolsoPagamento } from "../src/modules/payments/payment-refund.reconciliation.js";

describe("Reconciliação de reembolsos do Mercado Pago", () => {
  const agora = new Date("2026-11-10T15:00:00.000Z");

  const pagamento = {
    id: "pagamento-123",
    enrollmentId: "inscricao-123",
    providerOrderId: "order-456",
    providerPaymentId: "789",
    status: "APPROVED",
    amount: "149.90",
  };

  const order = {
    id: "order-456",
  };

  const pagamentoMercadoPago = {
    id: 789,
  };

  beforeEach(() => {
    vi.resetAllMocks();

    mocks.consultarOrderMercadoPago.mockResolvedValue(order);
    mocks.consultarPagamentoMercadoPago.mockResolvedValue(pagamentoMercadoPago);

    mocks.validarReembolsoTotalMercadoPago.mockReturnValue({
      providerPaymentId: "789",
      valorReembolsado: "149.90",
    });

    mocks.registrarPagamentoReembolsado.mockResolvedValue({
      paymentStatus: "REFUNDED",
      incidentType: "PAYMENT_REFUNDED",
      alreadyProcessed: false,
    });
  });

  it("registra reembolso integral confirmado", async () => {
    const resultado = await reconciliarReembolsoPagamento({
      pagamento,
      agora,
    });

    expect(mocks.consultarOrderMercadoPago).toHaveBeenCalledWith({
      id: "order-456",
    });

    expect(mocks.consultarPagamentoMercadoPago).toHaveBeenCalledWith({
      id: "789",
    });

    expect(mocks.validarReembolsoTotalMercadoPago).toHaveBeenCalledWith({
      order,
      pagamento,
      pagamentoMercadoPago,
    });

    expect(mocks.registrarPagamentoReembolsado).toHaveBeenCalledWith({
      pagamento,
      providerPaymentId: "789",
      agora,
    });

    expect(resultado).toEqual({
      paymentStatus: "REFUNDED",
      incidentType: "PAYMENT_REFUNDED",
      alreadyProcessed: false,
      reconciled: true,
    });
  });

  it("não registra reembolso ainda não confirmado", async () => {
    const erro = Object.assign(
      new Error("O reembolso total ainda não foi confirmado."),
      {
        statusCode: 422,
        code: "REFUND_NOT_FULLY_CONFIRMED",
      },
    );

    mocks.validarReembolsoTotalMercadoPago.mockImplementation(() => {
      throw erro;
    });

    const resultado = await reconciliarReembolsoPagamento({
      pagamento,
      agora,
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      refundStatus: "NOT_FULLY_CONFIRMED",
      reconciled: false,
    });

    expect(mocks.registrarPagamentoReembolsado).not.toHaveBeenCalled();
  });

  it("rejeita pagamento que não está aprovado", async () => {
    await expect(
      reconciliarReembolsoPagamento({
        pagamento: {
          ...pagamento,
          status: "PENDING",
        },
        agora,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      message:
        "O pagamento não está disponível para reconciliação de reembolso.",
    });

    expect(mocks.consultarOrderMercadoPago).not.toHaveBeenCalled();
    expect(mocks.registrarPagamentoReembolsado).not.toHaveBeenCalled();
  });

  it("rejeita pagamento sem identificador do provedor", async () => {
    await expect(
      reconciliarReembolsoPagamento({
        pagamento: {
          ...pagamento,
          providerPaymentId: null,
        },
        agora,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
    });

    expect(mocks.consultarOrderMercadoPago).not.toHaveBeenCalled();
  });

  it("propaga inconsistência financeira sem persistir", async () => {
    const erro = Object.assign(
      new Error("Os valores do pagamento são inconsistentes."),
      { statusCode: 422 },
    );

    mocks.validarReembolsoTotalMercadoPago.mockImplementation(() => {
      throw erro;
    });

    await expect(
      reconciliarReembolsoPagamento({
        pagamento,
        agora,
      }),
    ).rejects.toBe(erro);

    expect(mocks.registrarPagamentoReembolsado).not.toHaveBeenCalled();
  });

  it("propaga falha de comunicação com Mercado Pago", async () => {
    const erro = new Error("Falha na API do Mercado Pago.");

    mocks.consultarPagamentoMercadoPago.mockRejectedValue(erro);

    await expect(
      reconciliarReembolsoPagamento({
        pagamento,
        agora,
      }),
    ).rejects.toBe(erro);

    expect(mocks.validarReembolsoTotalMercadoPago).not.toHaveBeenCalled();
    expect(mocks.registrarPagamentoReembolsado).not.toHaveBeenCalled();
  });

  it("propaga falha de persistência financeira", async () => {
    const erro = new Error("Falha ao atualizar pagamento.");

    mocks.registrarPagamentoReembolsado.mockRejectedValue(erro);

    await expect(
      reconciliarReembolsoPagamento({
        pagamento,
        agora,
      }),
    ).rejects.toBe(erro);
  });

  it("preserva resultado idempotente da persistência", async () => {
    mocks.registrarPagamentoReembolsado.mockResolvedValue({
      paymentStatus: "REFUNDED",
      incidentType: "PAYMENT_REFUNDED",
      alreadyProcessed: true,
      incidentAlreadyExists: true,
    });

    const resultado = await reconciliarReembolsoPagamento({
      pagamento,
      agora,
    });

    expect(resultado).toMatchObject({
      paymentStatus: "REFUNDED",
      alreadyProcessed: true,
      incidentAlreadyExists: true,
      reconciled: true,
    });
  });

  it("identifica pagamento sem registros de reembolso", async () => {
    const orderSemReembolso = {
      ...order,
      transactions: {
        refunds: [],
      },
    };

    const pagamentoSemReembolso = {
      ...pagamentoMercadoPago,
      refunds: [],
    };

    mocks.consultarOrderMercadoPago.mockResolvedValue(orderSemReembolso);

    mocks.consultarPagamentoMercadoPago.mockResolvedValue(
      pagamentoSemReembolso,
    );

    const erro = Object.assign(
      new Error("O reembolso total ainda não foi confirmado."),
      {
        statusCode: 422,
        code: "REFUND_NOT_FULLY_CONFIRMED",
      },
    );

    mocks.validarReembolsoTotalMercadoPago.mockImplementation(() => {
      throw erro;
    });

    const resultado = await reconciliarReembolsoPagamento({
      pagamento,
      agora,
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      refundStatus: "NO_REFUND",
      reconciled: false,
    });

    expect(mocks.validarReembolsoTotalMercadoPago).toHaveBeenCalledWith({
      order: orderSemReembolso,
      pagamento,
      pagamentoMercadoPago: pagamentoSemReembolso,
    });

    expect(mocks.registrarPagamentoReembolsado).not.toHaveBeenCalled();
  });
});
