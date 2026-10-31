import { MercadoPagoConfig } from "mercadopago";

export function obterClienteMercadopago() {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

    if (!accessToken) {
        throw new Error(
            "A váriavel MERCADO_PAGO_ACCESS_TOKEN não foi configurada."
        );
    }

    return new MercadoPagoConfig({
        accessToken,
        options: {
            timeout: 5000,
        },
    });
}