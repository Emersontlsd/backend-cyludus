
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

const { prismaMock, criarCheckoutPagamentoMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
    },
  },
  criarCheckoutPagamentoMock: vi.fn(),
}));

vi.mock("../src/config/prisma.ts", () => ({
  prisma: prismaMock,
}));

vi.mock("../src/modules/payments/payment.service.js", () => ({
  criarCheckoutPagamento: criarCheckoutPagamentoMock,
}));

import paymentRoutes from "../src/routes/payment.routes.js";

const app = express();

app.use(express.json());
app.use("/api/payments", paymentRoutes);

describe("Rotas de pagamento", () => {
  const userId = "usuario-123";
  const enrollmentId = "550e8400-e29b-41d4-a716-446655440000";

  const usuario = {
    id: userId,
    name: "Usuário Teste",
    email: "teste@cyludus.com",
    role: "USER",
    isActive: true,
  };

  let token;

  beforeEach(() => {
    vi.clearAllMocks();

    token = jwt.sign(
      { sub: userId },
      process.env.JWT_SECRET
    );

    prismaMock.user.findUnique.mockResolvedValue(usuario);

    criarCheckoutPagamentoMock.mockResolvedValue({
      id: "pagamento-123",
      enrollmentId,
      status: "PENDING",
      checkoutUrl: "https://www.mercadopago.com.br/checkout/teste",
      amount: "199.90",
      currency: "BRL",
    });
  });

  it("deve impedir acesso sem token de autenticação", async () => {
    const resposta = await request(app)
      .post("/api/payments/checkout")
      .send({ enrollmentId });

    expect(resposta.status).toBe(401);
    expect(criarCheckoutPagamentoMock).not.toHaveBeenCalled();
  });

  it("deve rejeitar um token inválido", async () => {
    const resposta = await request(app)
      .post("/api/payments/checkout")
      .set("Authorization", "Bearer token-invalido")
      .send({ enrollmentId });

    expect(resposta.status).toBe(401);
    expect(criarCheckoutPagamentoMock).not.toHaveBeenCalled();
  });

  it("deve rejeitar um enrollmentId inválido", async () => {
    const resposta = await request(app)
      .post("/api/payments/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ enrollmentId: "id-invalido" });

    expect(resposta.status).toBe(400);
    expect(criarCheckoutPagamentoMock).not.toHaveBeenCalled();
  });

  it("deve rejeitar a ausência do enrollmentId", async () => {
    const resposta = await request(app)
      .post("/api/payments/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(resposta.status).toBe(400);
    expect(criarCheckoutPagamentoMock).not.toHaveBeenCalled();
  });

  it("deve rejeitar propriedades adicionais no corpo da requisição", async () => {
    const resposta = await request(app)
      .post("/api/payments/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({
        enrollmentId,
        amount: 1,
        userId: "outro-usuario",
      });

    expect(resposta.status).toBe(400);
    expect(criarCheckoutPagamentoMock).not.toHaveBeenCalled();
  });

  it("deve criar checkout para o usuário autenticado", async () => {
    const resposta = await request(app)
      .post("/api/payments/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ enrollmentId });

    expect(resposta.status).toBe(200);

    expect(criarCheckoutPagamentoMock).toHaveBeenCalledOnce();
    expect(criarCheckoutPagamentoMock).toHaveBeenCalledWith(
      userId,
      enrollmentId
    );

    expect(resposta.body.pagamento.id).toBe("pagamento-123");
    expect(resposta.body.pagamento.checkoutUrl).toBe(
      "https://www.mercadopago.com.br/checkout/teste"
    );
  });

  it("deve retornar o erro informado pelo serviço", async () => {
    criarCheckoutPagamentoMock.mockRejectedValue(
      Object.assign(new Error("Inscrição não encontrada."), {
        statusCode: 404,
      })
    );

    const resposta = await request(app)
      .post("/api/payments/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ enrollmentId });

    expect(resposta.status).toBe(404);
    expect(resposta.body.mensagem).toBe("Inscrição não encontrada.");
  });
});
