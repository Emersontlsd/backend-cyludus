import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createHmac } from "node:crypto";

const mocks = vi.hoisted(() => ({
  processarWebhookPagamento: vi.fn(),
}));

vi.mock("../src/modules/payments/payment-webhook.orchestrator.js", () => ({
  processarWebhookPagamento: mocks.processarWebhookPagamento,
}));

import paymentRoutes from "../src/routes/payment.routes.js";
import paymentWebhookRoutes from "../src/routes/payment-webhook.routes.js";

const app = express();

app.use(express.json());

// A rota pública deve ser registrada primeiro.
app.use("/api/payments/webhook", paymentWebhookRoutes);
app.use("/api/payments", paymentRoutes);

const SEGREDO = "segredo-teste-webhook";
const DATA_ID = "123456789";
const REQUEST_ID = "request-teste-123";

function gerarAssinatura(timestamp = Math.floor(Date.now() / 1000)) {
  const manifest = `id:${DATA_ID};request-id:${REQUEST_ID};ts:${timestamp};`;

  const hash = createHmac("sha256", SEGREDO).update(manifest).digest("hex");

  return `ts=${timestamp},v1=${hash}`;
}

describe("Rota pública do webhook do Mercado Pago", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = SEGREDO;
  });

  afterEach(() => {
    delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  });

  it("deve rejeitar uma requisição sem assinatura", async () => {
    const resposta = await request(app)
      .post("/api/payments/webhook")
      .query({ "data.id": DATA_ID });

    expect(resposta.status).toBe(401);
    expect(resposta.body.mensagem).toBe("Assinatura do webhook inválida.");
  });

  it("deve rejeitar uma assinatura inválida", async () => {
    const resposta = await request(app)
      .post("/api/payments/webhook")
      .query({ "data.id": DATA_ID })
      .set("x-signature", "ts=123456,v1=assinatura-invalida")
      .set("x-request-id", REQUEST_ID);

    expect(resposta.status).toBe(401);
  });

  it("deve validar a assinatura sem exigir JWT", async () => {
    mocks.processarWebhookPagamento.mockResolvedValue({
      paymentStatus: "APPROVED",
      enrollmentStatus: "ACTIVE",
      alreadyProcessed: false,
    });

    const resposta = await request(app)
      .post("/api/payments/webhook")
      .query({ "data.id": DATA_ID })
      .set("x-signature", gerarAssinatura())
      .set("x-request-id", REQUEST_ID);

    expect(resposta.status).toBe(200);

    expect(mocks.processarWebhookPagamento).toHaveBeenCalledWith({
      orderId: DATA_ID,
    });

    expect(resposta.body.mensagem).toBe("Notificação processada com sucesso.");
  });

  it("deve manter o checkout protegido por JWT", async () => {
    const resposta = await request(app).post("/api/payments/checkout").send({
      enrollmentId: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(resposta.status).toBe(401);
  });

  it("deve rejeitar uma notificação sem data.id", async () => {
    const resposta = await request(app)
      .post("/api/payments/webhook")
      .set("x-signature", gerarAssinatura())
      .set("x-request-id", REQUEST_ID);

    expect(resposta.status).toBe(401);

    expect(resposta.body.mensagem).toBe("Assinatura do webhook inválida.");
  });

  it("deve rejeitar uma notificação sem x-request-id", async () => {
    const resposta = await request(app)
      .post("/api/payments/webhook")
      .query({ "data.id": DATA_ID })
      .set("x-signature", gerarAssinatura());

    expect(resposta.status).toBe(401);

    expect(resposta.body.mensagem).toBe("Assinatura do webhook inválida.");
  });

  it("deve rejeitar uma assinatura expirada", async () => {
    const timestampExpirado = Math.floor(Date.now() / 1000) - 600;

    const resposta = await request(app)
      .post("/api/payments/webhook")
      .query({ "data.id": DATA_ID })
      .set("x-signature", gerarAssinatura(timestampExpirado))
      .set("x-request-id", REQUEST_ID);

    expect(resposta.status).toBe(401);

    expect(resposta.body.mensagem).toBe("Assinatura do webhook inválida.");
  });

  it("deve rejeitar notificações quando o segredo não está configurado", async () => {
    delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;

    const resposta = await request(app)
      .post("/api/payments/webhook")
      .query({ "data.id": DATA_ID })
      .set("x-signature", gerarAssinatura())
      .set("x-request-id", REQUEST_ID);

    expect(resposta.status).toBe(500);

    expect(resposta.body.mensagem).toBe("Não foi possível validar o webhook.");
  });

  it("não deve processar pagamento quando a assinatura é inválida", async () => {
    const resposta = await request(app)
      .post("/api/payments/webhook")
      .query({ "data.id": DATA_ID })
      .set("x-signature", "ts=123456,v1=assinatura-invalida")
      .set("x-request-id", REQUEST_ID);

    expect(resposta.status).toBe(401);

    expect(mocks.processarWebhookPagamento).not.toHaveBeenCalled();
  });

  it("deve encaminhar uma notificação válida ao orquestrador", async () => {
    mocks.processarWebhookPagamento.mockResolvedValue({
      paymentStatus: "APPROVED",
      enrollmentStatus: "ACTIVE",
      alreadyProcessed: false,
    });

    const resposta = await request(app)
      .post("/api/payments/webhook")
      .query({ "data.id": DATA_ID })
      .set("x-signature", gerarAssinatura())
      .set("x-request-id", REQUEST_ID);

    expect(resposta.status).toBe(200);

    expect(mocks.processarWebhookPagamento).toHaveBeenCalledWith({
      orderId: DATA_ID,
    });

    expect(resposta.body).toEqual({
      mensagem: "Notificação processada com sucesso.",
    });
  });

  it("deve retornar 503 quando o orquestrador falhar", async () => {
    const erro = new Error("Falha simulada no processamento financeiro.");
    erro.statusCode = 500;

    mocks.processarWebhookPagamento.mockRejectedValue(erro);

    const resposta = await request(app)
      .post("/api/payments/webhook")
      .query({ "data.id": DATA_ID })
      .set("x-signature", gerarAssinatura())
      .set("x-request-id", REQUEST_ID);

    expect(resposta.status).toBe(503);

    expect(resposta.body).toEqual({
      mensagem: "Não foi possível processar o webhook.",
    });

    expect(mocks.processarWebhookPagamento).toHaveBeenCalledTimes(1);

    expect(mocks.processarWebhookPagamento).toHaveBeenCalledWith({
      orderId: DATA_ID,
    });
  });

  it("deve confirmar uma notificação de pagamento já processado", async () => {
    mocks.processarWebhookPagamento.mockResolvedValue({
      paymentStatus: "APPROVED",
      enrollmentStatus: "ACTIVE",
      alreadyProcessed: true,
    });

    const resposta = await request(app)
      .post("/api/payments/webhook")
      .query({ "data.id": DATA_ID })
      .set("x-signature", gerarAssinatura())
      .set("x-request-id", REQUEST_ID);

    expect(resposta.status).toBe(200);

    expect(resposta.body).toEqual({
      mensagem: "Notificação processada com sucesso.",
    });

    expect(mocks.processarWebhookPagamento).toHaveBeenCalledTimes(1);

    expect(mocks.processarWebhookPagamento).toHaveBeenCalledWith({
      orderId: DATA_ID,
    });
  });
});
