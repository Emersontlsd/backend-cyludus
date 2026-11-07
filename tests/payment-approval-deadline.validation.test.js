import { describe, expect, it } from "vitest";

import { validarPrazoAprovacaoMercadoPago } from "../src/modules/payments/payment-order.validation.js";

describe("Prazo de aprovação do pagamento Mercado Pago", () => {
  const expiresAt = "2026-11-04T15:00:00.000Z";
  const agora = new Date("2026-11-04T16:00:00.000Z");

  function validar(dataAprovacao, vencimento = expiresAt) {
    return validarPrazoAprovacaoMercadoPago({
      dataAprovacao,
      expiresAt: vencimento,
      agora,
    });
  }

  it("aceita aprovação antes do vencimento", () => {
    expect(validar("2026-11-04T14:30:00.000Z")).toBe(true);
  });

  it("aceita aprovação exatamente no vencimento", () => {
    expect(validar("2026-11-04T15:00:00.000Z")).toBe(true);
  });

  it("rejeita aprovação após o vencimento", () => {
    expect(() => validar("2026-11-04T15:01:00.000Z")).toThrow(
      "O pagamento foi aprovado após o vencimento da inscrição.",
    );

    expect(() => validar("2026-11-04T15:01:00.000Z")).toThrow(
      expect.objectContaining({
        statusCode: 422,
        code: "PAYMENT_APPROVED_AFTER_EXPIRATION",
      }),
    );
  });

  it("rejeita data de aprovação no futuro", () => {
    expect(() => validar("2026-11-04T17:00:00.000Z")).toThrow(
      "A data de aprovação do pagamento está no futuro.",
    );
  });

  it("rejeita data de aprovação inválida", () => {
    expect(() => validar("data-invalida")).toThrow(
      "As datas de aprovação ou vencimento são inválidas.",
    );
  });

  it("rejeita data de vencimento inválida", () => {
    expect(() => validar("2026-11-04T14:30:00.000Z", "data-invalida")).toThrow(
      "As datas de aprovação ou vencimento são inválidas.",
    );
  });
});
