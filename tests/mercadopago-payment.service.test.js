import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetPagamento } = vi.hoisted(() => ({
  mockGetPagamento: vi.fn(),
}));

vi.mock("mercadopago", () => ({
  Order: vi.fn(),
  Payment: vi.fn().mockImplementation(function () {
    this.get = mockGetPagamento;
  }),
}));

vi.mock("../src/config/mercadopago.js", () => ({
  obterClienteMercadopago: vi.fn(() => ({
    accessToken: "token-de-teste",
  })),
}));

import { Payment } from "mercadopago";
import { consultarPagamentoMercadoPago } from "../src/modules/payments/mercadopago-order.service.js";

describe("Consulta individual de pagamento no Mercado Pago", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("consulta um pagamento pelo identificador", async () => {
    const resposta = {
      id: 123456,
      status: "approved",
      date_approved: "2026-11-04T11:30:00.000Z",
    };

    mockGetPagamento.mockResolvedValue(resposta);

    const resultado = await consultarPagamentoMercadoPago({
      id: "123456",
    });

    expect(Payment).toHaveBeenCalledOnce();
    expect(mockGetPagamento).toHaveBeenCalledWith({
      id: "123456",
    });
    expect(resultado).toEqual(resposta);
  });

  it("aceita identificador numérico", async () => {
    mockGetPagamento.mockResolvedValue({
      id: 123456,
    });

    await consultarPagamentoMercadoPago({
      id: 123456,
    });

    expect(mockGetPagamento).toHaveBeenCalledWith({
      id: "123456",
    });
  });

  it("rejeita identificador vazio", async () => {
    await expect(
      consultarPagamentoMercadoPago({
        id: " ",
      }),
    ).rejects.toThrow(
      "O identificador do pagamento do Mercado Pago é obrigatório.",
    );

    expect(mockGetPagamento).not.toHaveBeenCalled();
  });

  it("propaga falhas da API do Mercado Pago", async () => {
    mockGetPagamento.mockRejectedValue(
      new Error("Falha na API do Mercado Pago"),
    );

    await expect(
      consultarPagamentoMercadoPago({
        id: "123456",
      }),
    ).rejects.toThrow("Falha na API do Mercado Pago");
  });
});
