import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMock, getMock, obterClienteMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  getMock: vi.fn(),
  obterClienteMock: vi.fn(),
}));

vi.mock("mercadopago", () => ({
  Order: class {
    constructor() {
      this.create = createMock;
      this.get = getMock;
    }
  },
}));

vi.mock("../src/config/mercadopago.js", () => ({
  obterClienteMercadopago: obterClienteMock,
}));

import {
  criarOrderMercadoPago,
  consultarOrderMercadoPago,
} from "../src/modules/payments/mercadopago-order.service.js";

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

  it("deve propagar erros retornados pelo Mercado Pago ao criar", async () => {
    const erroMercadoPago = new Error("Erro simulado do Mercado Pago");

    createMock.mockRejectedValue(erroMercadoPago);

    await expect(
      criarOrderMercadoPago({
        body: { type: "online" },
        idempotencyKey: "chave-teste-456",
      }),
    ).rejects.toThrow("Erro simulado do Mercado Pago");
  });

  it("deve consultar uma Order pelo ID", async () => {
    const respostaEsperada = {
      id: "order-teste-123",
      status: "processed",
      external_reference: "pagamento-local-123",
    };

    getMock.mockResolvedValue(respostaEsperada);

    const resultado = await consultarOrderMercadoPago({
      id: "order-teste-123",
    });

    expect(resultado).toEqual(respostaEsperada);

    expect(getMock).toHaveBeenCalledExactlyOnceWith({
      id: "order-teste-123",
    });

    expect(obterClienteMock).toHaveBeenCalledOnce();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("deve rejeitar a consulta sem ID válido", async () => {
    for (const id of [undefined, null, "", "   ", 123]) {
      await expect(
        consultarOrderMercadoPago({ id }),
      ).rejects.toThrow(
        "O ID do pedido do Mercado Pago é obrigatório.",
      );
    }

    expect(getMock).not.toHaveBeenCalled();
    expect(obterClienteMock).not.toHaveBeenCalled();
  });

  it("deve propagar erros retornados pelo Mercado Pago ao consultar", async () => {
    getMock.mockRejectedValue(
      new Error("Falha simulada na consulta"),
    );

    await expect(
      consultarOrderMercadoPago({
        id: "order-teste-456",
      }),
    ).rejects.toThrow("Falha simulada na consulta");

    expect(getMock).toHaveBeenCalledExactlyOnceWith({
      id: "order-teste-456",
    });
  });
});
