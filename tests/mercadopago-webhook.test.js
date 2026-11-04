import { describe, it, expect, afterEach } from "vitest";
import {
  validarAssinaturaWebhook,
} from "../src/modules/payments/mercadopago-webhook.service.js";
import { createHmac } from "node:crypto";

const SEGREDO_TESTE = "segredo-teste-webhook";
const DATA_ID = "123456789";
const REQUEST_ID = "request-teste-123";

function gerarAssinatura({
  dataId = DATA_ID,
  requestId = REQUEST_ID,
  timestamp = Math.floor(Date.now() / 1000),
} = {}) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;

  const hash = createHmac("sha256", SEGREDO_TESTE)
    .update(manifest)
    .digest("hex");

  return `ts=${timestamp},v1=${hash}`;
}

afterEach(() => {
  delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
});

describe("Mercado Pago Webhook", () => {
  it("deve aceitar uma assinatura válida", () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = SEGREDO_TESTE;

    const assinatura = gerarAssinatura();

    expect(
      validarAssinaturaWebhook({
        assinatura,
        requisicaoId: REQUEST_ID,
        dataId: DATA_ID,
      }),
    ).toBe(true);
  });

  it("deve rejeitar uma assinatura inválida", () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = SEGREDO_TESTE;

    expect(() =>
      validarAssinaturaWebhook({
        assinatura: "ts=123456,v1=assinatura-invalida",
        requisicaoId: REQUEST_ID,
        dataId: DATA_ID,
      }),
    ).toThrow();
  });

  it("deve rejeitar uma assinatura ausente", () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = SEGREDO_TESTE;

    expect(() =>
      validarAssinaturaWebhook({
        assinatura: undefined,
        requisicaoId: REQUEST_ID,
        dataId: DATA_ID,
      }),
    ).toThrow();
  });

  it("deve rejeitar uma assinatura fora da tolerância de tempo", () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = SEGREDO_TESTE;

    const timestampAntigo = Math.floor(Date.now() / 1000) - 600;

    const assinatura = gerarAssinatura({
      timestamp: timestampAntigo,
    });

    expect(() =>
      validarAssinaturaWebhook({
        assinatura,
        requisicaoId: REQUEST_ID,
        dataId: DATA_ID,
      }),
    ).toThrow();
  });

  it("deve retornar erro 500 quando o segredo não estiver configurado", () => {
    expect(() =>
      validarAssinaturaWebhook({
        assinatura: gerarAssinatura(),
        requisicaoId: REQUEST_ID,
        dataId: DATA_ID,
      }),
    ).toThrow(
      "A variável MERCADO_PAGO_WEBHOOK_SECRET não foi configurada.",
    );
  });
});