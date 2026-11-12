import { describe, expect, it } from "vitest";

import { validarReembolsoTotalMercadoPago } from "../src/modules/payments/payment-refund.validation.js";

describe("Validação de reembolso total do Mercado Pago", () => {
  const pagamento = {
    id: "pagamento-123",
    providerOrderId: "order-456",
    providerPaymentId: "789",
    amount: "149.90",
    currency: "BRL",
    status: "APPROVED",
  };

  function criarCenario({
    valorReembolsado = "149.90",
    statusReembolso = "approved",
    transactionId = "789",
  } = {}) {
    const order = {
      id: "order-456",
      external_reference: "pagamento-123",
      total_amount: "149.90",
      currency: "BRL",
      transactions: {
        payments: [
          {
            id: "789",
            amount: "149.90",
            paid_amount: "149.90",
            refunded_amount: valorReembolsado,
          },
        ],
        refunds: [
          {
            id: "123",
            transaction_id: transactionId,
            amount: valorReembolsado,
            status: statusReembolso,
          },
        ],
        chargebacks: [],
      },
    };

    const pagamentoMercadoPago = {
      id: 789,
      transaction_amount: 149.9,
      transaction_amount_refunded: Number(valorReembolsado),
      refunds: [
        {
          id: 123,
          payment_id: 789,
          amount: Number(valorReembolsado),
          status: statusReembolso,
        },
      ],
    };

    return { order, pagamentoMercadoPago };
  }

  it("confirma reembolso total aprovado", () => {
    const { order, pagamentoMercadoPago } = criarCenario();

    expect(
      validarReembolsoTotalMercadoPago({
        order,
        pagamento,
        pagamentoMercadoPago,
      }),
    ).toEqual({
      providerPaymentId: "789",
      valorReembolsado: "149.90",
    });
  });

  it("não confirma reembolso parcial", () => {
    const { order, pagamentoMercadoPago } = criarCenario({
      valorReembolsado: "50.00",
    });

    expect(() =>
      validarReembolsoTotalMercadoPago({
        order,
        pagamento,
        pagamentoMercadoPago,
      }),
    ).toThrow("O reembolso total ainda não foi confirmado.");
  });

  it("não confirma reembolso pendente", () => {
    const { order, pagamentoMercadoPago } = criarCenario({
      statusReembolso: "pending",
    });

    expect(() =>
      validarReembolsoTotalMercadoPago({
        order,
        pagamento,
        pagamentoMercadoPago,
      }),
    ).toThrow("O reembolso total ainda não foi confirmado.");
  });

  it("rejeita reembolso de outra transação", () => {
    const { order, pagamentoMercadoPago } = criarCenario({
      transactionId: "999",
    });

    expect(() =>
      validarReembolsoTotalMercadoPago({
        order,
        pagamento,
        pagamentoMercadoPago,
      }),
    ).toThrow("O reembolso não corresponde ao pagamento original.");
  });
});

describe("Segurança de reembolsos acumulados", () => {
  const pagamento = {
    id: "pagamento-123",
    providerOrderId: "order-456",
    providerPaymentId: "789",
    amount: "149.90",
    currency: "BRL",
    status: "APPROVED",
  };

  function criarCenario(reembolsosOrder, reembolsosPagamento) {
    return {
      pagamento,
      order: {
        id: "order-456",
        external_reference: "pagamento-123",
        total_amount: "149.90",
        currency: "BRL",
        transactions: {
          payments: [
            {
              id: "789",
              amount: "149.90",
              paid_amount: "149.90",
              refunded_amount: "149.90",
            },
          ],
          refunds: reembolsosOrder,
          chargebacks: [],
        },
      },
      pagamentoMercadoPago: {
        id: 789,
        transaction_amount: 149.9,
        transaction_amount_refunded: 149.9,
        refunds: reembolsosPagamento,
      },
    };
  }

  it("aceita dois reembolsos aprovados que totalizam o pagamento", () => {
    const dados = criarCenario(
      [
        {
          id: "101",
          transaction_id: "789",
          amount: "50.00",
          status: "approved",
        },
        {
          id: "102",
          transaction_id: "789",
          amount: "99.90",
          status: "approved",
        },
      ],
      [
        { id: 101, payment_id: 789, amount: 50, status: "approved" },
        { id: 102, payment_id: 789, amount: 99.9, status: "approved" },
      ],
    );

    expect(validarReembolsoTotalMercadoPago(dados)).toEqual({
      providerPaymentId: "789",
      valorReembolsado: "149.90",
    });
  });

  it("rejeita identificadores duplicados de reembolso", () => {
    const dados = criarCenario(
      [
        {
          id: "101",
          transaction_id: "789",
          amount: "50.00",
          status: "approved",
        },
        {
          id: "101",
          transaction_id: "789",
          amount: "99.90",
          status: "approved",
        },
      ],
      [
        { id: 101, payment_id: 789, amount: 50, status: "approved" },
        { id: 101, payment_id: 789, amount: 99.9, status: "approved" },
      ],
    );

    expect(() => validarReembolsoTotalMercadoPago(dados)).toThrow(
      "Foram encontrados identificadores de reembolso duplicados.",
    );
  });
});

describe("Consistência entre Order e Payment", () => {
  it("rejeita valores divergentes para os mesmos reembolsos", () => {
    const pagamento = {
      id: "pagamento-123",
      providerOrderId: "order-456",
      providerPaymentId: "789",
      amount: "149.90",
      currency: "BRL",
      status: "APPROVED",
    };

    const order = {
      id: "order-456",
      external_reference: "pagamento-123",
      total_amount: "149.90",
      currency: "BRL",
      transactions: {
        payments: [
          {
            id: "789",
            amount: "149.90",
            paid_amount: "149.90",
            refunded_amount: "149.90",
          },
        ],
        refunds: [
          {
            id: "101",
            transaction_id: "789",
            amount: "50.00",
            status: "approved",
          },
          {
            id: "102",
            transaction_id: "789",
            amount: "99.90",
            status: "approved",
          },
        ],
        chargebacks: [],
      },
    };

    const pagamentoMercadoPago = {
      id: 789,
      transaction_amount: 149.9,
      transaction_amount_refunded: 149.9,
      refunds: [
        {
          id: 101,
          payment_id: 789,
          amount: 60,
          status: "approved",
        },
        {
          id: 102,
          payment_id: 789,
          amount: 89.9,
          status: "approved",
        },
      ],
    };

    expect(() =>
      validarReembolsoTotalMercadoPago({
        order,
        pagamento,
        pagamentoMercadoPago,
      }),
    ).toThrow(
      "Os registros de reembolso das APIs Order e Payment são inconsistentes.",
    );
  });

  it("aceita IDs diferentes quando os registros financeiros coincidem", () => {
    const pagamento = {
      id: "pagamento-123",
      providerOrderId: "order-456",
      providerPaymentId: "789",
      amount: "149.90",
      currency: "BRL",
      status: "APPROVED",
    };

    const order = {
      id: "order-456",
      external_reference: "pagamento-123",
      total_amount: "149.90",
      currency: "BRL",
      transactions: {
        payments: [
          {
            id: "789",
            amount: "149.90",
            paid_amount: "149.90",
            refunded_amount: "149.90",
          },
        ],
        refunds: [
          {
            id: "refund-order-abc",
            transaction_id: "789",
            amount: "149.90",
            status: "approved",
          },
        ],
        chargebacks: [],
      },
    };

    const pagamentoMercadoPago = {
      id: 789,
      transaction_amount: 149.9,
      transaction_amount_refunded: 149.9,
      refunds: [
        {
          id: 123,
          payment_id: 789,
          amount: 149.9,
          status: "approved",
        },
      ],
    };

    expect(
      validarReembolsoTotalMercadoPago({
        order,
        pagamento,
        pagamentoMercadoPago,
      }),
    ).toEqual({
      providerPaymentId: "789",
      valorReembolsado: "149.90",
    });
  });
});

describe("Proteção contra chargebacks", () => {
  it("rejeita reembolso quando existe um chargeback", () => {
    const pagamento = {
      id: "pagamento-123",
      providerOrderId: "order-456",
      providerPaymentId: "789",
      amount: "149.90",
      currency: "BRL",
      status: "APPROVED",
    };

    const order = {
      id: "order-456",
      external_reference: "pagamento-123",
      total_amount: "149.90",
      currency: "BRL",
      transactions: {
        payments: [
          {
            id: "789",
            amount: "149.90",
            paid_amount: "149.90",
            refunded_amount: "149.90",
          },
        ],
        refunds: [
          {
            id: "123",
            transaction_id: "789",
            amount: "149.90",
            status: "approved",
          },
        ],
        chargebacks: [
          {
            id: "chargeback-001",
            transaction_id: "789",
            status: "in_process",
          },
        ],
      },
    };

    const pagamentoMercadoPago = {
      id: 789,
      transaction_amount: 149.9,
      transaction_amount_refunded: 149.9,
      refunds: [
        {
          id: 123,
          payment_id: 789,
          amount: 149.9,
          status: "approved",
        },
      ],
    };

    expect(() =>
      validarReembolsoTotalMercadoPago({
        order,
        pagamento,
        pagamentoMercadoPago,
      }),
    ).toThrow("O pedido possui registros de chargeback.");
  });
});

describe("Proteção contra dados incompletos", () => {
  const pagamento = {
    id: "pagamento-123",
    providerOrderId: "order-456",
    providerPaymentId: "789",
    amount: "149.90",
    currency: "BRL",
    status: "APPROVED",
  };

  function criarCenario() {
    return {
      order: {
        id: "order-456",
        external_reference: "pagamento-123",
        total_amount: "149.90",
        currency: "BRL",
        transactions: {
          payments: [
            {
              id: "789",
              amount: "149.90",
              paid_amount: "149.90",
              refunded_amount: "149.90",
            },
          ],
          refunds: [
            {
              id: "123",
              transaction_id: "789",
              amount: "149.90",
              status: "approved",
            },
          ],
          chargebacks: [],
        },
      },
      pagamentoMercadoPago: {
        id: 789,
        transaction_amount: 149.9,
        transaction_amount_refunded: 149.9,
        refunds: [
          {
            id: 123,
            payment_id: 789,
            amount: 149.9,
            status: "approved",
          },
        ],
      },
    };
  }

  it("rejeita quando a lista de reembolsos do Payment está ausente", () => {
    const { order, pagamentoMercadoPago } = criarCenario();

    delete pagamentoMercadoPago.refunds;

    expect(() =>
      validarReembolsoTotalMercadoPago({
        order,
        pagamento,
        pagamentoMercadoPago,
      }),
    ).toThrow("Os dados do reembolso são insuficientes.");
  });

  it("rejeita quando o valor de um reembolso está ausente", () => {
    const { order, pagamentoMercadoPago } = criarCenario();

    delete pagamentoMercadoPago.refunds[0].amount;

    expect(() =>
      validarReembolsoTotalMercadoPago({
        order,
        pagamento,
        pagamentoMercadoPago,
      }),
    ).toThrow("Valor monetário inválido.");
  });

  it("rejeita reembolso com valor negativo", () => {
    const { order, pagamentoMercadoPago } = criarCenario();

    order.transactions.refunds[0].amount = "-149.90";
    pagamentoMercadoPago.refunds[0].amount = -149.9;

    expect(() =>
      validarReembolsoTotalMercadoPago({
        order,
        pagamento,
        pagamentoMercadoPago,
      }),
    ).toThrow("Valor monetário inválido.");
  });

  it("rejeita reembolso acima do valor original", () => {
    const { order, pagamentoMercadoPago } = criarCenario();

    order.transactions.refunds[0].amount = "160.00";
    pagamentoMercadoPago.refunds[0].amount = 160;

    order.transactions.payments[0].refunded_amount = "160.00";
    pagamentoMercadoPago.transaction_amount_refunded = 160;

    expect(() =>
      validarReembolsoTotalMercadoPago({
        order,
        pagamento,
        pagamentoMercadoPago,
      }),
    ).toThrow("O valor reembolsado excede o pagamento original.");
  });

  it("rejeita divergência no valor acumulado da Order", () => {
    const { order, pagamentoMercadoPago } = criarCenario();

    order.transactions.payments[0].refunded_amount = "100.00";

    expect(() =>
      validarReembolsoTotalMercadoPago({
        order,
        pagamento,
        pagamentoMercadoPago,
      }),
    ).toThrow(
      expect.objectContaining({
        message: "O reembolso total ainda não foi confirmado.",
        statusCode: 422,
        code: "REFUND_NOT_FULLY_CONFIRMED",
      }),
    );
  });

  it("rejeita divergência no valor acumulado do Payment", () => {
    const { order, pagamentoMercadoPago } = criarCenario();

    pagamentoMercadoPago.transaction_amount_refunded = 100;

    expect(() =>
      validarReembolsoTotalMercadoPago({
        order,
        pagamento,
        pagamentoMercadoPago,
      }),
    ).toThrow("O reembolso total ainda não foi confirmado.");
  });
});
