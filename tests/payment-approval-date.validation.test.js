
import { describe, expect, it } from "vitest";

import {
  validarDataAprovacaoMercadoPago,
} from "../src/modules/payments/payment-order.validation.js";

describe("Validação da data de aprovação do Mercado Pago", () => {
  const pagamento = {
    id: "pagamento-cyludus-123",
    amount: "149.90",
    currency: "BRL",
  };

  const pagamentoValido = {
    id: 123456,
    status: "approved",
    external_reference: pagamento.id,
    currency_id: "BRL",
    transaction_amount: 149.9,
    transaction_amount_refunded: 0,
    date_approved: "2026-11-04T11:30:00.000Z",
  };

  function validar(alteracoes = {}, id = "123456") {
    return validarDataAprovacaoMercadoPago({
      pagamentoConsultado: {
        ...pagamentoValido,
        ...alteracoes,
      },
      providerPaymentId: id,
      pagamento,
    });
  }

  it("retorna a data de um pagamento aprovado", () => {
    const resultado = validar();

    expect(resultado).toBeInstanceOf(Date);
    expect(resultado.toISOString()).toBe(
      "2026-11-04T11:30:00.000Z",
    );
  });

  it("rejeita pagamento com identificador diferente", () => {
    expect(() => validar({}, "999999")).toThrow(
      "O identificador do pagamento consultado não corresponde à transação.",
    );
  });

  it("rejeita pagamento que não está aprovado", () => {
    expect(() => validar({ status: "pending" })).toThrow(
      "O pagamento consultado não está aprovado.",
    );
  });

  it("rejeita referência externa incorreta", () => {
    expect(() =>
      validar({ external_reference: "outro-pagamento" }),
    ).toThrow(
      "A referência externa do pagamento consultado é inválida.",
    );
  });

  it("rejeita moeda diferente de BRL", () => {
    expect(() => validar({ currency_id: "USD" })).toThrow(
      "A moeda do pagamento consultado é inválida.",
    );
  });

  it("rejeita valor diferente do registrado", () => {
    expect(() =>
      validar({ transaction_amount: 149.89 }),
    ).toThrow(
      "O valor do pagamento consultado não corresponde ao valor registrado.",
    );
  });

  it("rejeita pagamento com valor reembolsado", () => {
    expect(() =>
      validar({ transaction_amount_refunded: 20 }),
    ).toThrow(
      "O pagamento consultado possui valor reembolsado.",
    );
  });

  it("rejeita pagamento sem data de aprovação", () => {
    expect(() => validar({ date_approved: null })).toThrow(
      "O pagamento aprovado não possui data de aprovação.",
    );
  });

  it("rejeita data de aprovação inválida", () => {
    expect(() =>
      validar({ date_approved: "data-invalida" }),
    ).toThrow(
      "A data de aprovação do pagamento é inválida.",
    );
  });
});
