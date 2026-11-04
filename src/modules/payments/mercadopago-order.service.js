import { Order } from "mercadopago";

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
