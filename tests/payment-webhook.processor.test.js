import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/config/prisma.ts";

import {
  consultarPedidoNotificado,
  localizarPagamentoNotificado,
  validarVinculoOrderPagamento,
  validarPagamentoAprovadoNotificado,
  verificarPagamentoJaProcessado,
} from "../src/modules/payments/payment-webhook.processor.js";

vi.mock("../src/config/prisma.ts", () => ({
  prisma: {
    payment: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../src/modules/payments/mercadopago-order.service.js", () => ({
  consultarOrderMercadoPago: vi.fn(),
}));

import { consultarOrderMercadoPago } from "../src/modules/payments/mercadopago-order.service.js";

import { consultarPedidoNotificado } from "../src/modules/payments/payment-webhook.processor.js";

describe("Processamento do webhook do Mercado Pago", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("consulta a Order diretamente no Mercado Pago", async () => {
    const order = {
      id: "order-456",
      external_reference: "pagamento-123",
      status: "processed",
    };

    consultarOrderMercadoPago.mockResolvedValue(order);

    const resultado = await consultarPedidoNotificado({
      orderId: "order-456",
    });

    expect(consultarOrderMercadoPago).toHaveBeenCalledWith({
      id: "order-456",
    });

    expect(resultado).toEqual(order);
  });

  it("rejeita identificadores inválidos sem consultar o Mercado Pago", async () => {
    consultarOrderMercadoPago.mockClear();

    await expect(consultarPedidoNotificado({ orderId: "" })).rejects.toThrow(
      "O identificador da Order do Mercado Pago é obrigatório.",
    );

    await expect(consultarPedidoNotificado({ orderId: "   " })).rejects.toThrow(
      "O identificador da Order do Mercado Pago é obrigatório.",
    );

    await expect(consultarPedidoNotificado({ orderId: null })).rejects.toThrow(
      "O identificador da Order do Mercado Pago é obrigatório.",
    );

    expect(consultarOrderMercadoPago).not.toHaveBeenCalled();
  });

  it("rejeita uma Order diferente da solicitada", async () => {
    consultarOrderMercadoPago.mockResolvedValue({
      id: "order-999",
      external_reference: "pagamento-123",
      status: "processed",
    });

    await expect(
      consultarPedidoNotificado({
        orderId: "order-456",
      }),
    ).rejects.toThrow(
      "A Order retornada pelo Mercado Pago não corresponde à notificação.",
    );

    expect(consultarOrderMercadoPago).toHaveBeenCalledWith({
      id: "order-456",
    });
  });

  it("localiza o pagamento pelo external_reference da Order", async () => {
    const order = {
      id: "order-456",
      external_reference: "pagamento-123",
    };

    const pagamento = {
      id: "pagamento-123",
      enrollmentId: "inscricao-123",
      provider: "MERCADO_PAGO",
      providerOrderId: "order-456",
      status: "PENDING",
      amount: "149.90",
      currency: "BRL",
    };

    prisma.payment.findUnique.mockResolvedValue({
      ...pagamento,
      enrollmentId: "inscricao-123",
      enrollment: {
        id: "inscricao-123",
        status: "PENDING",
        expiresAt: new Date("2026-11-05T12:00:00.000Z"),
      },
    });

    const resultado = await localizarPagamentoNotificado({ order });

    expect(prisma.payment.findUnique).toHaveBeenCalledWith({
      where: {
        id: "pagamento-123",
      },
      include: {
        enrollment: true,
      },
    });

    expect(resultado).toEqual({
      ...pagamento,
      enrollment: {
        id: "inscricao-123",
        status: "PENDING",
        expiresAt: new Date("2026-11-05T12:00:00.000Z"),
      },
    });
  });

  it("rejeita uma Order cujo pagamento não existe no banco", async () => {
    const order = {
      id: "order-456",
      external_reference: "pagamento-inexistente",
    };

    prisma.payment.findUnique.mockResolvedValue(null);

    await expect(localizarPagamentoNotificado({ order })).rejects.toThrow(
      "Pagamento não encontrado para a Order informada.",
    );

    expect(prisma.payment.findUnique).toHaveBeenCalledWith({
      where: {
        id: "pagamento-inexistente",
      },
      include: {
        enrollment: true,
      },
    });
  });

  it("rejeita uma Order sem referência externa válida", async () => {
    const referenciasInvalidas = [undefined, null, "", "   ", 123];

    for (const referencia of referenciasInvalidas) {
      await expect(
        localizarPagamentoNotificado({
          order: {
            id: "order-456",
            external_reference: referencia,
          },
        }),
      ).rejects.toThrow("A Order não possui uma referência externa válida.");
    }

    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
  });

  it("rejeita pagamento pertencente a outro provedor", async () => {
    const order = {
      id: "order-456",
      external_reference: "pagamento-123",
    };

    const pagamento = {
      id: "pagamento-123",
      enrollmentId: "inscricao-123",
      provider: "OUTRO_PROVEDOR",
      providerOrderId: "order-456",
      status: "PENDING",
      amount: "149.90",
      currency: "BRL",
    };

    prisma.payment.findUnique.mockResolvedValue(pagamento);

    await expect(localizarPagamentoNotificado({ order })).rejects.toThrow(
      "O pagamento não pertence ao Mercado Pago.",
    );

    expect(prisma.payment.findUnique).toHaveBeenCalledWith({
      where: {
        id: "pagamento-123",
      },
      include: {
        enrollment: true,
      },
    });
  });

  it("rejeita uma Order diferente da vinculada ao pagamento", () => {
    const order = {
      id: "order-999",
      external_reference: "pagamento-123",
      total_amount: "149.90",
      currency: "BRL",
    };

    const pagamento = {
      id: "pagamento-123",
      provider: "MERCADO_PAGO",
      providerOrderId: "order-456",
      amount: "149.90",
      currency: "BRL",
    };

    expect(() => validarVinculoOrderPagamento({ order, pagamento })).toThrow(
      "O identificador do pedido não corresponde ao pagamento.",
    );
  });

  it("rejeita uma Order com valor diferente do pagamento", () => {
    const order = {
      id: "order-456",
      external_reference: "pagamento-123",
      total_amount: "99.90",
      currency: "BRL",
    };

    const pagamento = {
      id: "pagamento-123",
      provider: "MERCADO_PAGO",
      providerOrderId: "order-456",
      amount: "149.90",
      currency: "BRL",
    };

    expect(() =>
      validarVinculoOrderPagamento({
        order,
        pagamento,
      }),
    ).toThrow("O valor do pedido não corresponde ao pagamento.");
  });

  it("valida uma transação efetivamente aprovada", () => {
    const pagamento = {
      id: "pagamento-123",
      provider: "MERCADO_PAGO",
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
      status: "processed",
      transactions: {
        payments: [
          {
            id: "transacao-789",
            status: "approved",
            amount: "149.90",
            paid_amount: "149.90",
            refunded_amount: "0",
            payment_method: {
              type: "credit_card",
              installments: 3,
            },
          },
        ],
        refunds: [],
        chargebacks: [],
      },
    };

    const resultado = validarPagamentoAprovadoNotificado({
      order,
      pagamento,
    });

    expect(resultado).toEqual({
      providerPaymentId: "transacao-789",
      paymentMethod: "credit_card",
      installments: 3,
    });
  });

  it("identifica um pagamento já aprovado", () => {
    const pagamento = {
      id: "pagamento-123",
      status: "APPROVED",
      providerPaymentId: "transacao-789",
      approvedAt: new Date("2026-11-04T12:00:00Z"),
    };

    const resultado = verificarPagamentoJaProcessado({
      pagamento,
      providerPaymentId: "transacao-789",
    });

    expect(resultado).toBe(true);
  });

  it("rejeita uma transação diferente para pagamento já aprovado", () => {
    const pagamento = {
      id: "pagamento-123",
      status: "APPROVED",
      providerPaymentId: "transacao-789",
      approvedAt: new Date("2026-11-04T12:00:00Z"),
    };

    expect(() =>
      verificarPagamentoJaProcessado({
        pagamento,
        providerPaymentId: "transacao-999",
      }),
    ).toThrow("O pagamento já foi aprovado com outra transação.");
  });

  it("rejeita pagamento com inscrição vinculada incorretamente", async () => {
    const pagamento = {
      id: "pagamento-123",
      enrollmentId: "inscricao-123",
      provider: "MERCADO_PAGO",
      providerOrderId: "order-456",
      status: "PENDING",
      amount: "149.90",
      currency: "BRL",
      enrollment: {
        id: "outra-inscricao",
        status: "PENDING",
        expiresAt: new Date("2026-11-05T12:00:00.000Z"),
      },
    };

    prisma.payment.findUnique.mockResolvedValue(pagamento);

    const order = {
      external_reference: "pagamento-123",
    };

    await expect(localizarPagamentoNotificado({ order })).rejects.toThrow(
      "A inscrição vinculada ao pagamento não foi encontrada.",
    );
  });
});
