import { Order, Payment } from "mercadopago";

import { obterClienteMercadopago } from "../../config/mercadopago.js";

export async function criarOrderMercadoPago({
    body,
    idempotencyKey,
}) {
    if (!idempotencyKey) {
        throw new Error("A chave de idempotência é obrigatória.");
    }

    const cliente = obterClienteMercadopago();
    const order = new Order(cliente);

    return order.create({
        body,
        requestOptions: {
            idempotencyKey,
        },
    });
}

export async function consultarOrderMercadoPago({id}) {
    if (typeof id !== "string" || !id.trim()) {
        throw new Error("O ID do pedido do Mercado Pago é obrigatório.");
    }

    const cliente = obterClienteMercadopago();
    const order = new Order(cliente);

    return order.get({
        id: id.trim(),
    });
}


export async function consultarPagamentoMercadoPago({ id }) {
  if (
    (typeof id !== "string" && typeof id !== "number") ||
    !String(id).trim()
  ) {
    const erro = new Error(
      "O identificador do pagamento do Mercado Pago é obrigatório.",
    );

    erro.statusCode = 400;
    throw erro;
  }

  const pagamento = new Payment(obterClienteMercadopago());

  return pagamento.get({
    id: String(id).trim(),
  });
}
