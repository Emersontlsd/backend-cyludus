import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config/prisma.ts", () => ({
  prisma: {
    enrollment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
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

describe("Validação de inscrição para pagamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar os dados da inscrição válida", async () => {
    prisma.enrollment.findUnique.mockResolvedValue(inscricaoValida);

    const resultado = await validarInscricaoParaPagamento(
      "usuario-123",
      inscricaoValida.id
    );

    expect(resultado.id).toBe(inscricaoValida.id);
    expect(resultado.user.email).toBe("teste@cyludus.com");
    expect(resultado.course.title).toBe("Curso de Teste");
  });

  it("deve rejeitar inscrição inexistente", async () => {
    prisma.enrollment.findUnique.mockResolvedValue(null);

    await expect(
      validarInscricaoParaPagamento("usuario-123", "inscricao-inexistente")
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
      validarInscricaoParaPagamento("usuario-123", inscricaoValida.id)
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
      validarInscricaoParaPagamento("usuario-123", inscricaoValida.id)
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
      validarInscricaoParaPagamento("usuario-123", inscricaoValida.id)
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
      validarInscricaoParaPagamento("usuario-123", inscricaoValida.id)
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
      validarInscricaoParaPagamento("usuario-123", inscricaoValida.id)
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});