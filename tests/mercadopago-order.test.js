import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMock, obterClienteMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  obterClienteMock: vi.fn(),
}));

vi.mock("mercadopago", () => ({
  Order: class {
    constructor() {
      this.create = createMock;
    }
  },
}));

vi.mock("../src/config/mercadopago.js", () => ({
  obterClienteMercadopago: obterClienteMock,
}));

import { criarOrderMercadoPago } from "../src/modules/payments/mercadopago-order.service.js";

describe("Integração com Orders API do Mercado Pago", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obterClienteMock.mockReturnValue({});
  });

  it("deve criar uma Order enviando a chave de idempotência", async () => {
    const respostaEsperada = {
      id: "order-teste-123",
      checkout_url: "https://checkout.mercadopago.com/teste",
    };

    createMock.mockResolvedValue(respostaEsperada);

    const body = {
      type: "online",
      processing_mode: "manual",
    };

    const resultado = await criarOrderMercadoPago({
      body,
      idempotencyKey: "chave-teste-123",
    });

    expect(resultado).toEqual(respostaEsperada);

    expect(createMock).toHaveBeenCalledWith({
      body,
      requestOptions: {
        idempotencyKey: "chave-teste-123",
      },
    });

    expect(obterClienteMock).toHaveBeenCalledOnce();
  });

  it("deve rejeitar a chamada sem chave de idempotência", async () => {
    await expect(
      criarOrderMercadoPago({
        body: {},
        idempotencyKey: null,
      }),
    ).rejects.toThrow("A chave de idempotência é obrigatória.");

    expect(createMock).not.toHaveBeenCalled();
    expect(obterClienteMock).not.toHaveBeenCalled();
  });

  it("deve propagar erros retornados pelo Mercado Pago", async () => {
    const erroMercadoPago = new Error("Erro simulado do Mercado Pago");

    createMock.mockRejectedValue(erroMercadoPago);

    await expect(
      criarOrderMercadoPago({
        body: {
          type: "online",
        },
        idempotencyKey: "chave-teste-456",
      }),
    ).rejects.toThrow("Erro simulado do Mercado Pago");
  });
});