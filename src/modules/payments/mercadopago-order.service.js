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