import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createHmac } from "node:crypto";

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

function gerarAssinatura() {
  const timestamp = Math.floor(Date.now() / 1000);

  const manifest =
    `id:${DATA_ID};request-id:${REQUEST_ID};ts:${timestamp};`;

  const hash = createHmac("sha256", SEGREDO)
    .update(manifest)
    .digest("hex");

  return `ts=${timestamp},v1=${hash}`;
}

describe("Rota pública do webhook do Mercado Pago", () => {
  beforeEach(() => {
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
    expect(resposta.body.mensagem).toBe(
      "Assinatura do webhook inválida.",
    );
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
    const resposta = await request(app)
      .post("/api/payments/webhook")
      .query({ "data.id": DATA_ID })
      .set("x-signature", gerarAssinatura())
      .set("x-request-id", REQUEST_ID);

    expect(resposta.status).toBe(503);

    expect(resposta.body.mensagem).toBe(
      "Processamento do webhook ainda não está disponível.",
    );
  });

  it("deve manter o checkout protegido por JWT", async () => {
    const resposta = await request(app)
      .post("/api/payments/checkout")
      .send({
        enrollmentId: "550e8400-e29b-41d4-a716-446655440000",
      });

    expect(resposta.status).toBe(401);
  });
});