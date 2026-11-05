import { describe, expect, it } from "vitest";
import {
  validarIdentidadeOrderMercadoPago,
  validarTransacaoAprovadaMercadoPago,
} from "../src/modules/payments/payment-order.validation.js";

describe("Validação de identidade da Order do Mercado Pago", () => {
  const pagamento = {
    id: "pagamento-123",
    providerOrderId: "order-456",
    amount: "149.90",
    currency: "BRL",
  };

  const order = {
    id: "order-456",
    external_reference: "pagamento-123",
    total_amount: "149.90",
    currency: "BRL",
  };

  it("aceita um pedido com todos os dados correspondentes", () => {
    expect(validarIdentidadeOrderMercadoPago({ order, pagamento })).toBe(true);
  });

  it("rejeita um identificador de pedido diferente", () => {
    expect(() =>
      validarIdentidadeOrderMercadoPago({
        order: { ...order, id: "order-incorreta" },
        pagamento,
      }),
    ).toThrow("O identificador do pedido não corresponde ao pagamento.");
  });

  it("rejeita uma referência externa diferente", () => {
    expect(() =>
      validarIdentidadeOrderMercadoPago({
        order: { ...order, external_reference: "outro-pagamento" },
        pagamento,
      }),
    ).toThrow("A referência externa do pedido não corresponde ao pagamento.");
  });

  it("rejeita uma moeda diferente", () => {
    expect(() =>
      validarIdentidadeOrderMercadoPago({
        order: { ...order, currency: "USD" },
        pagamento,
      }),
    ).toThrow("A moeda do pedido não corresponde ao pagamento.");
  });

  it("rejeita um valor diferente", () => {
    expect(() =>
      validarIdentidadeOrderMercadoPago({
        order: { ...order, total_amount: "149.89" },
        pagamento,
      }),
    ).toThrow("O valor do pedido não corresponde ao pagamento.");
  });

  it("aceita valores monetários equivalentes", () => {
    expect(
      validarIdentidadeOrderMercadoPago({
        order: { ...order, total_amount: "149.9" },
        pagamento,
      }),
    ).toBe(true);
  });

  it("rejeita valores monetários inválidos", () => {
    expect(() =>
      validarIdentidadeOrderMercadoPago({
        order: { ...order, total_amount: "valor-invalido" },
        pagamento,
      }),
    ).toThrow("Valor monetário inválido.");
  });

  it("rejeita pedidos sem dados suficientes", () => {
    expect(() =>
      validarIdentidadeOrderMercadoPago({
        order: null,
        pagamento,
      }),
    ).toThrow("Dados insuficientes para validar o pedido.");
  });

  it("rejeita pagamentos sem identificador do pedido", () => {
    expect(() =>
      validarIdentidadeOrderMercadoPago({
        order,
        pagamento: { ...pagamento, providerOrderId: null },
      }),
    ).toThrow("O identificador do pedido não corresponde ao pagamento.");
  });
});

describe("Validação de transações financeiras do Mercado Pago", () => {
  it("reconhece uma transação aprovada com valor integral", () => {
    const order = {
      id: "order-456",
      external_reference: "pagamento-123",
      total_amount: "149.90",
      total_paid_amount: "149.90",
      currency: "BRL",
      transactions: {
        payments: [
          {
            id: "mp-payment-789",
            status: "approved",
            amount: "149.90",
            paid_amount: "149.90",
            refunded_amount: "0.00",
            payment_method: {
              id: "visa",
              type: "credit_card",
              installments: 3,
            },
          },
        ],
        refunds: [],
        chargebacks: [],
      },
    };

    const pagamento = {
      id: "pagamento-123",
      providerOrderId: "order-456",
      amount: "149.90",
      currency: "BRL",
    };

    const resultado = validarTransacaoAprovadaMercadoPago({
      order,
      pagamento,
    });

    expect(resultado).toEqual({
      providerPaymentId: "mp-payment-789",
      paymentMethod: "credit_card",
      installments: 3,
    });
  });

  it("rejeita uma transação com pagamento pendente", () => {
    const pagamento = {
      id: "pagamento-123",
      providerOrderId: "order-456",
      amount: "149.90",
      currency: "BRL",
    };

    const order = {
      id: "order-456",
      external_reference: "pagamento-123",
      total_amount: "149.90",
      total_paid_amount: "0.00",
      currency: "BRL",
      transactions: {
        payments: [
          {
            id: "mp-payment-789",
            status: "pending",
            amount: "149.90",
            paid_amount: "0.00",
          },
        ],
        refunds: [],
        chargebacks: [],
      },
    };

    expect(() =>
      validarTransacaoAprovadaMercadoPago({ order, pagamento }),
    ).toThrow("O pedido não possui uma única transação aprovada.");
  });

  it("rejeita uma transação com pagamento recusado", () => {
    const pagamento = {
      id: "pagamento-123",
      providerOrderId: "order-456",
      amount: "149.90",
      currency: "BRL",
    };

    const order = {
      id: "order-456",
      external_reference: "pagamento-123",
      total_amount: "149.90",
      total_paid_amount: "0.00",
      currency: "BRL",
      transactions: {
        payments: [
          {
            id: "mp-payment-789",
            status: "rejected",
            amount: "149.90",
            paid_amount: "0.00",
          },
        ],
        refunds: [],
        chargebacks: [],
      },
    };

    expect(() =>
      validarTransacaoAprovadaMercadoPago({ order, pagamento }),
    ).toThrow("O pedido não possui uma única transação aprovada.");
  });

  it("rejeita pagamento aprovado com valor recebido inferior", () => {
    const pagamento = {
      id: "pagamento-123",
      providerOrderId: "order-456",
      amount: "149.90",
      currency: "BRL",
    };

    const order = {
      id: "order-456",
      external_reference: "pagamento-123",
      total_amount: "149.90",
      total_paid_amount: "100.00",
      currency: "BRL",
      transactions: {
        payments: [
          {
            id: "mp-payment-789",
            status: "approved",
            amount: "149.90",
            paid_amount: "100.00",
            refunded_amount: "0.00",
            payment_method: {
              id: "visa",
              type: "credit_card",
              installments: 3,
            },
          },
        ],
        refunds: [],
        chargebacks: [],
      },
    };

    expect(() =>
      validarTransacaoAprovadaMercadoPago({ order, pagamento }),
    ).toThrow("O valor efetivamente pago não corresponde ao pagamento.");
  });

  it("rejeita pagamento aprovado com reembolso registrado", () => {
    const pagamento = {
      id: "pagamento-123",
      providerOrderId: "order-456",
      amount: "149.90",
      currency: "BRL",
    };

    const order = {
      id: "order-456",
      external_reference: "pagamento-123",
      total_amount: "149.90",
      total_paid_amount: "149.90",
      currency: "BRL",
      transactions: {
        payments: [
          {
            id: "mp-payment-789",
            status: "approved",
            amount: "149.90",
            paid_amount: "149.90",
            refunded_amount: "149.90",
            payment_method: {
              id: "visa",
              type: "credit_card",
              installments: 3,
            },
          },
        ],
        refunds: [
          {
            id: "refund-123",
            transaction_id: "mp-payment-789",
            amount: "149.90",
            status: "approved",
          },
        ],
        chargebacks: [],
      },
    };

    expect(() =>
      validarTransacaoAprovadaMercadoPago({ order, pagamento }),
    ).toThrow("O pedido possui registros de reembolso.");
  });

  it("rejeita pagamento aprovado com chargeback registrado", () => {
    const pagamento = {
      id: "pagamento-123",
      providerOrderId: "order-456",
      amount: "149.90",
      currency: "BRL",
    };

    const order = {
      id: "order-456",
      external_reference: "pagamento-123",
      total_amount: "149.90",
      total_paid_amount: "149.90",
      currency: "BRL",
      transactions: {
        payments: [
          {
            id: "mp-payment-789",
            status: "approved",
            amount: "149.90",
            paid_amount: "149.90",
            refunded_amount: "0.00",
            payment_method: {
              id: "visa",
              type: "credit_card",
              installments: 3,
            },
          },
        ],
        refunds: [],
        chargebacks: [
          {
            id: "chargeback-123",
            transaction_id: "mp-payment-789",
            case_id: "case-456",
            status: "opened",
          },
        ],
      },
    };

    expect(() =>
      validarTransacaoAprovadaMercadoPago({ order, pagamento }),
    ).toThrow("O pedido possui registros de estorno.");
  });

it("rejeita pagamento aprovado com reembolso parcial", () => {
  const pagamento = {
    id: "pagamento-123",
    providerOrderId: "order-456",
    amount: "149.90",
    currency: "BRL",
  };

  const order = {
    id: "order-456",
    external_reference: "pagamento-123",
    total_amount: "149.90",
    total_paid_amount: "149.90",
    currency: "BRL",
    transactions: {
      payments: [
        {
          id: "mp-payment-789",
          status: "approved",
          amount: "149.90",
          paid_amount: "149.90",
          refunded_amount: "50.00",
          payment_method: {
            id: "visa",
            type: "credit_card",
            installments: 3,
          },
        },
      ],
      refunds: [],
      chargebacks: [],
    },
  };

  expect(() =>
    validarTransacaoAprovadaMercadoPago({ order, pagamento }),
  ).toThrow("A transação possui valor reembolsado.");
});


it("rejeita pedido com múltiplas transações aprovadas", () => {
  const pagamento = {
    id: "pagamento-123",
    providerOrderId: "order-456",
    amount: "149.90",
    currency: "BRL",
  };

  const order = {
    id: "order-456",
    external_reference: "pagamento-123",
    total_amount: "149.90",
    total_paid_amount: "149.90",
    currency: "BRL",
    transactions: {
      payments: [
        {
          id: "mp-payment-789",
          status: "approved",
          amount: "149.90",
          paid_amount: "149.90",
          refunded_amount: "0.00",
          payment_method: {
            id: "visa",
            type: "credit_card",
            installments: 3,
          },
        },
        {
          id: "mp-payment-790",
          status: "approved",
          amount: "149.90",
          paid_amount: "149.90",
          refunded_amount: "0.00",
          payment_method: {
            id: "master",
            type: "credit_card",
            installments: 1,
          },
        },
      ],
      refunds: [],
      chargebacks: [],
    },
  };

  expect(() =>
    validarTransacaoAprovadaMercadoPago({ order, pagamento }),
  ).toThrow("O pedido não possui uma única transação aprovada.");
});


it("rejeita transação aprovada sem identificador", () => {
  const pagamento = {
    id: "pagamento-123",
    providerOrderId: "order-456",
    amount: "149.90",
    currency: "BRL",
  };

  const order = {
    id: "order-456",
    external_reference: "pagamento-123",
    total_amount: "149.90",
    total_paid_amount: "149.90",
    currency: "BRL",
    transactions: {
      payments: [
        {
          status: "approved",
          amount: "149.90",
          paid_amount: "149.90",
          refunded_amount: "0.00",
          payment_method: {
            id: "visa",
            type: "credit_card",
            installments: 3,
          },
        },
      ],
      refunds: [],
      chargebacks: [],
    },
  };

  expect(() =>
    validarTransacaoAprovadaMercadoPago({ order, pagamento }),
  ).toThrow(
    "A transação aprovada não possui identificador válido.",
  );
});


it("rejeita transação com mais de 12 parcelas", () => {
  const pagamento = {
    id: "pagamento-123",
    providerOrderId: "order-456",
    amount: "149.90",
    currency: "BRL",
  };

  const order = {
    id: "order-456",
    external_reference: "pagamento-123",
    total_amount: "149.90",
    total_paid_amount: "149.90",
    currency: "BRL",
    transactions: {
      payments: [
        {
          id: "mp-payment-789",
          status: "approved",
          amount: "149.90",
          paid_amount: "149.90",
          refunded_amount: "0.00",
          payment_method: {
            id: "visa",
            type: "credit_card",
            installments: 13,
          },
        },
      ],
      refunds: [],
      chargebacks: [],
    },
  };

  expect(() =>
    validarTransacaoAprovadaMercadoPago({ order, pagamento }),
  ).toThrow("A quantidade de parcelas é inválida.");
});


it("rejeita transação aprovada sem forma de pagamento", () => {
  const pagamento = {
    id: "pagamento-123",
    providerOrderId: "order-456",
    amount: "149.90",
    currency: "BRL",
  };

  const order = {
    id: "order-456",
    external_reference: "pagamento-123",
    total_amount: "149.90",
    total_paid_amount: "149.90",
    currency: "BRL",
    transactions: {
      payments: [
        {
          id: "mp-payment-789",
          status: "approved",
          amount: "149.90",
          paid_amount: "149.90",
          refunded_amount: "0.00",
        },
      ],
      refunds: [],
      chargebacks: [],
    },
  };

  expect(() =>
    validarTransacaoAprovadaMercadoPago({ order, pagamento }),
  ).toThrow("A forma de pagamento não foi identificada.");
});

});
