
import { describe, expect, it } from "vitest";

import {
  construirOrderRequest,
} from "../src/modules/payments/payment-order.builder.js";

describe("Construção da ordem do Mercado Pago", () => {
  const pagamento = {
    id: "pagamento-123",
    amount: 199.9,
  };

  const inscricao = {
    id: "inscricao-123",
    expiresAt: new Date("2026-11-03T15:00:00.000Z"),
    user: {
      name: "Usuário Teste",
      email: "teste@cyludus.com",
    },
    course: {
      id: "curso-123",
      title: "Curso de Teste",
    },
  };

  it("deve construir uma ordem online com os dados corretos", () => {
    const resultado = construirOrderRequest({
      pagamento,
      inscricao,
    });

    expect(resultado.type).toBe("online");
    expect(resultado.processing_mode).toBe("manual");
    expect(resultado.external_reference).toBe("pagamento-123");
    expect(resultado.total_amount).toBe("199.90");
    expect(resultado.currency).toBe("BRL");
  });

  it("deve utilizar o e-mail e o nome do usuário cadastrado", () => {
    const resultado = construirOrderRequest({
      pagamento,
      inscricao,
    });

    expect(resultado.payer).toEqual({
      email: "teste@cyludus.com",
      first_name: "Usuário",
      last_name: "Teste",
    });
  });

  it("deve incluir o curso como item da ordem", () => {
    const resultado = construirOrderRequest({
      pagamento,
      inscricao,
    });

    expect(resultado.items).toHaveLength(1);

    expect(resultado.items[0]).toEqual({
      title: "Curso de Teste",
      description: "Acesso ao curso Curso de Teste",
      category_id: "education",
      quantity: 1,
      unit_measure: "unit",
      unit_price: "199.90",
    });
  });

  it("deve incluir o pagamento e respeitar o vencimento da inscrição", () => {
    const resultado = construirOrderRequest({
      pagamento,
      inscricao,
    });

    expect(resultado.transactions.payments).toHaveLength(1);

    expect(resultado.transactions.payments[0]).toEqual({
      amount: "199.90",
      date_of_expiration: "2026-11-03T15:00:00.000Z",
    });
  });

  it("deve permitir até 12 parcelas", () => {
    const resultado = construirOrderRequest({
      pagamento,
      inscricao,
    });

    expect(
      resultado.config.payment_method.max_installments,
    ).toBe(12);
  });

  it("deve formatar o valor com duas casas decimais", () => {
    const resultado = construirOrderRequest({
      pagamento: {
        ...pagamento,
        amount: 150,
      },
      inscricao,
    });

    expect(resultado.total_amount).toBe("150.00");
    expect(resultado.transactions.payments[0].amount).toBe("150.00");
    expect(resultado.items[0].unit_price).toBe("150.00");
  });

  it("deve permitir usuário com apenas um nome", () => {
    const resultado = construirOrderRequest({
      pagamento,
      inscricao: {
        ...inscricao,
        user: {
          name: "Emerson",
          email: "emerson@cyludus.com",
        },
      },
    });

    expect(resultado.payer).toEqual({
      email: "emerson@cyludus.com",
      first_name: "Emerson",
    });
  });
});
