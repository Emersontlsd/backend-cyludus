import { beforeEach, describe, expect, it, vi } from "vitest";

const { construirOrderRequestMock, criarOrderMercadoPagoMock } = vi.hoisted(
  () => ({
    construirOrderRequestMock: vi.fn(),
    criarOrderMercadoPagoMock: vi.fn(),
  }),
);

vi.mock("../src/config/prisma.ts", () => ({
  prisma: {
    enrollment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../src/modules/payments/payment-order.builder.js", () => ({
  construirOrderRequest: construirOrderRequestMock,
}));

vi.mock("../src/modules/payments/mercadopago-order.service.js", () => ({
  criarOrderMercadoPago: criarOrderMercadoPagoMock,
}));

import { prisma } from "../src/config/prisma.ts";
import { criarCheckoutPagamento } from "../src/modules/payments/payment.service.js";

const inscricao = {
  id: "e8a1b3c2-1234-4567-8901-123456789abc",
  userId: "usuario-123",
  status: "PENDING",
  priceAtPurchase: 199.9,
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  user: {
    id: "usuario-123",
    name: "Usuário Teste",
    email: "teste@cyludus.com",
    isActive: true,
  },
  course: {
    id: "curso-123",
    title: "Curso de Teste",
  },
};

const orderRequest = {
  type: "online",
  processing_mode: "manual",
  external_reference: "pagamento-123",
  total_amount: "199.90",
};

const pagamentoInicial = {
  id: "pagamento-123",
  enrollmentId: inscricao.id,
  provider: "MERCADO_PAGO",
  status: "INITIATING",
  idempotencyKey: "chave-idempotencia-123",
  orderRequest: null,
  providerOrderId: null,
  checkoutUrl: null,
  amount: 199.9,
  currency: "BRL",
  installments: 1,
};

const respostaMercadoPago = {
  id: "order-mercadopago-123",
  status: "created",
  checkout_url: "https://checkout.mercadopago.com/teste",
};

describe("Criação de checkout de pagamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    pagamentoInicial.orderRequest = null;

    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        payment: prisma.payment,
      }),
    );

    prisma.enrollment.findUnique.mockResolvedValue(inscricao);

    prisma.payment.findFirst.mockResolvedValue(null);

    prisma.payment.create.mockResolvedValue(pagamentoInicial);

    prisma.payment.updateMany.mockImplementation(async ({ data }) => {
      pagamentoInicial.orderRequest = data.orderRequest;

      return {
        count: 1,
      };
    });

    prisma.payment.findUnique.mockImplementation(async () => ({
      orderRequest: pagamentoInicial.orderRequest,
    }));

    prisma.payment.update.mockImplementation(async ({ data }) => ({
      ...pagamentoInicial,
      ...data,
    }));

    construirOrderRequestMock.mockReturnValue(orderRequest);

    criarOrderMercadoPagoMock.mockResolvedValue(respostaMercadoPago);
  });

  it("deve criar a ordem e salvar os dados do checkout", async () => {
    const resultado = await criarCheckoutPagamento("usuario-123", inscricao.id);

    expect(construirOrderRequestMock).toHaveBeenCalledOnce();

    expect(criarOrderMercadoPagoMock).toHaveBeenCalledWith({
      body: orderRequest,
      idempotencyKey: pagamentoInicial.idempotencyKey,
    });

    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: pagamentoInicial.id,
        },
        data: expect.objectContaining({
          providerOrderId: respostaMercadoPago.id,
          checkoutUrl: respostaMercadoPago.checkout_url,
          status: "PENDING",
        }),
      }),
    );

    expect(resultado.checkoutUrl).toBe(respostaMercadoPago.checkout_url);
  });

  it("deve salvar o orderRequest antes de chamar o Mercado Pago", async () => {
    const ordemDasOperacoes = [];

    prisma.payment.updateMany.mockImplementation(async ({ data }) => {
      ordemDasOperacoes.push("salvar-orderRequest");
      pagamentoInicial.orderRequest = data.orderRequest;

      return {
        count: 1,
      };
    });

    prisma.payment.findUnique.mockImplementation(async () => {
      ordemDasOperacoes.push("recuperar-orderRequest");

      return {
        orderRequest: pagamentoInicial.orderRequest,
      };
    });

    criarOrderMercadoPagoMock.mockImplementation(async () => {
      ordemDasOperacoes.push("chamar-mercado-pago");
      return respostaMercadoPago;
    });

    prisma.payment.update.mockImplementation(async ({ data }) => {
      ordemDasOperacoes.push("salvar-checkout");

      return {
        ...pagamentoInicial,
        ...data,
      };
    });

    await criarCheckoutPagamento("usuario-123", inscricao.id);

    expect(ordemDasOperacoes).toEqual([
      "salvar-orderRequest",
      "recuperar-orderRequest",
      "chamar-mercado-pago",
      "salvar-checkout",
    ]);
  });

  it("deve reutilizar o checkout quando já existir uma URL", async () => {
    const pagamentoExistente = {
      ...pagamentoInicial,
      status: "PENDING",
      providerOrderId: "order-existente",
      checkoutUrl: "https://checkout.mercadopago.com/existente",
      orderRequest,
    };

    prisma.payment.findFirst.mockResolvedValue(pagamentoExistente);

    const resultado = await criarCheckoutPagamento("usuario-123", inscricao.id);

    expect(resultado).toEqual(pagamentoExistente);
    expect(criarOrderMercadoPagoMock).not.toHaveBeenCalled();
    expect(construirOrderRequestMock).not.toHaveBeenCalled();
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it("deve reutilizar o orderRequest e a chave de idempotência existentes", async () => {
    const pagamentoExistente = {
      ...pagamentoInicial,
      orderRequest,
    };

    prisma.payment.findFirst.mockResolvedValue(pagamentoExistente);

    await criarCheckoutPagamento("usuario-123", inscricao.id);

    expect(construirOrderRequestMock).not.toHaveBeenCalled();

    expect(criarOrderMercadoPagoMock).toHaveBeenCalledWith({
      body: orderRequest,
      idempotencyKey: pagamentoInicial.idempotencyKey,
    });
  });

  it("deve preservar o pagamento quando houver falha na comunicação", async () => {
    criarOrderMercadoPagoMock.mockRejectedValue(
      new Error("Falha de comunicação com o Mercado Pago"),
    );

    await expect(
      criarCheckoutPagamento("usuario-123", inscricao.id),
    ).rejects.toThrow("Falha de comunicação com o Mercado Pago");

    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: pagamentoInicial.id,
        orderRequest: expect.anything(),
      },
      data: {
        orderRequest,
      },
    });

    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it("não deve marcar o pagamento como pendente sem URL de checkout", async () => {
    criarOrderMercadoPagoMock.mockResolvedValue({
      id: "order-sem-checkout",
      status: "created",
    });

    await expect(
      criarCheckoutPagamento("usuario-123", inscricao.id),
    ).rejects.toThrow(
      "O Mercado Pago não retornou os dados necessários para o checkout.",
    );

    expect(prisma.payment.updateMany).toHaveBeenCalledOnce();

    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
});
