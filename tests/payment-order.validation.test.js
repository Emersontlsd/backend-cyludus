import { describe, expect, it } from "vitest";
import { validarIdentidadeOrderMercadoPago } from "../src/modules/payments/payment-order.validation.js";

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
    expect(
      validarIdentidadeOrderMercadoPago({ order, pagamento }),
    ).toBe(true);
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