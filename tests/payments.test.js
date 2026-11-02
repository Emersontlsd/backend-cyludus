import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  validarInscricaoParaPagamento,
  obterOuCriarPagamento,
} from "../src/modules/payments/payment.service.js";

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
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "../src/config/prisma.ts";
import { validarInscricaoParaPagamento } from "../src/modules/payments/payment.service.js";

const inscricaoValida = {
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

const transacaoMock = {
  payment: prisma.payment,
};

describe("Validação de inscrição para pagamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback) => {
      return callback(transacaoMock);
    });
  });

  it("deve retornar os dados da inscrição válida", async () => {
    prisma.enrollment.findUnique.mockResolvedValue(inscricaoValida);

    const resultado = await validarInscricaoParaPagamento(
      "usuario-123",
      inscricaoValida.id,
    );

    expect(resultado.id).toBe(inscricaoValida.id);
    expect(resultado.user.email).toBe("teste@cyludus.com");
    expect(resultado.course.title).toBe("Curso de Teste");
  });

  it("deve rejeitar inscrição inexistente", async () => {
    prisma.enrollment.findUnique.mockResolvedValue(null);

    await expect(
      validarInscricaoParaPagamento("usuario-123", "inscricao-inexistente"),
    ).rejects.toMatchObject({
      message: "Inscrição não encontrada.",
      statusCode: 404,
    });
  });

  it("deve rejeitar inscrição pertencente a outro usuário", async () => {
    prisma.enrollment.findUnique.mockResolvedValue({
      ...inscricaoValida,
      userId: "outro-usuario",
    });

    await expect(
      validarInscricaoParaPagamento("usuario-123", inscricaoValida.id),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("deve rejeitar usuário inativo", async () => {
    prisma.enrollment.findUnique.mockResolvedValue({
      ...inscricaoValida,
      user: {
        ...inscricaoValida.user,
        isActive: false,
      },
    });

    await expect(
      validarInscricaoParaPagamento("usuario-123", inscricaoValida.id),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("deve rejeitar inscrição que não esteja pendente", async () => {
    prisma.enrollment.findUnique.mockResolvedValue({
      ...inscricaoValida,
      status: "ACTIVE",
    });

    await expect(
      validarInscricaoParaPagamento("usuario-123", inscricaoValida.id),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("deve expirar inscrição cujo prazo terminou", async () => {
    prisma.enrollment.findUnique.mockResolvedValue({
      ...inscricaoValida,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      validarInscricaoParaPagamento("usuario-123", inscricaoValida.id),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "O prazo de pagamento desta inscrição expirou.",
    });

    expect(prisma.enrollment.update).toHaveBeenCalledWith({
      where: {
        id: inscricaoValida.id,
      },
      data: {
        status: "EXPIRED",
      },
    });
  });

  it("deve rejeitar inscrição sem e-mail", async () => {
    prisma.enrollment.findUnique.mockResolvedValue({
      ...inscricaoValida,
      user: {
        ...inscricaoValida.user,
        email: null,
      },
    });

    await expect(
      validarInscricaoParaPagamento("usuario-123", inscricaoValida.id),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe("Criação e recuperação de pagamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.$transaction.mockImplementation(async (callback) => {
      return callback(transacaoMock);
    });
  });

  it("deve criar um pagamento INITIATING com chave de idempotência", async () => {
    prisma.payment.findFirst.mockResolvedValue(null);

    prisma.payment.create.mockImplementation(async ({ data }) => ({
      id: "pagamento-123",
      ...data,
    }));

    const resultado = await obterOuCriarPagamento(inscricaoValida);

    expect(prisma.payment.findFirst).toHaveBeenCalledWith({
      where: {
        enrollmentId: inscricaoValida.id,
        status: {
          in: ["INITIATING", "PENDING"],
        },
      },
    });

    expect(prisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        enrollmentId: inscricaoValida.id,
        provider: "MERCADO_PAGO",
        status: "INITIATING",
        amount: inscricaoValida.priceAtPurchase,
        currency: "BRL",
        installments: 1,
        idempotencyKey: expect.any(String),
      }),
    });

    expect(resultado.status).toBe("INITIATING");
    expect(resultado.idempotencyKey).toEqual(expect.any(String));
  });

  it("deve reutilizar pagamento que já possui checkout", async () => {
    const pagamentoExistente = {
      id: "pagamento-123",
      enrollmentId: inscricaoValida.id,
      status: "PENDING",
      idempotencyKey: "chave-existente",
      checkoutUrl: "https://checkout.mercadopago.com/teste",
    };

    prisma.payment.findFirst.mockResolvedValue(pagamentoExistente);

    const resultado = await obterOuCriarPagamento(inscricaoValida);

    expect(resultado).toEqual(pagamentoExistente);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("deve reutilizar pagamento INITIATING mantendo a mesma chave", async () => {
    const pagamentoExistente = {
      id: "pagamento-123",
      enrollmentId: inscricaoValida.id,
      status: "INITIATING",
      idempotencyKey: "chave-existente",
      checkoutUrl: null,
    };

    prisma.payment.findFirst.mockResolvedValue(pagamentoExistente);

    const resultado = await obterOuCriarPagamento(inscricaoValida);

    expect(resultado).toEqual(pagamentoExistente);
    expect(resultado.idempotencyKey).toBe("chave-existente");
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("deve preservar o orderRequest do pagamento existente", async () => {
    const orderRequest = {
      type: "online",
      total_amount: "199.90",
      currency: "BRL",
    };

    const pagamentoExistente = {
      id: "pagamento-123",
      enrollmentId: inscricaoValida.id,
      status: "INITIATING",
      idempotencyKey: "chave-existente",
      orderRequest,
      checkoutUrl: null,
    };

    prisma.payment.findFirst.mockResolvedValue(pagamentoExistente);

    const resultado = await obterOuCriarPagamento(inscricaoValida);

    expect(resultado.orderRequest).toEqual(orderRequest);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("deve recuperar o pagamento existente quando houver conflito de unicidade", async () => {
    const pagamentoExistente = {
      id: "pagamento-123",
      enrollmentId: inscricaoValida.id,
      status: "INITIATING",
      idempotencyKey: "chave-ja-persistida",
      checkoutUrl: null,
    };

    const erroUnicidade = new Error("Unique constraint failed");
    erroUnicidade.code = "P2002";

    prisma.$transaction.mockRejectedValueOnce(erroUnicidade);
    prisma.payment.findFirst.mockResolvedValue(pagamentoExistente);

    const resultado = await obterOuCriarPagamento(inscricaoValida);

    expect(resultado).toEqual(pagamentoExistente);
    expect(resultado.idempotencyKey).toBe("chave-ja-persistida");
  });
});
