import { WebhookSignatureValidator } from "mercadopago";

export function validarAssinaturaWebhook({
    assinatura,
    requisicaoId,
    dataId,
}) {
    const segredo = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

    if (!segredo) {
        const erro = new Error(
            "A variável MERCADO_PAGO_WEBHOOK_SECRET não foi configurada.",
        );

        erro.statusCode = 500;
        throw erro;
    }

    WebhookSignatureValidator.validate({
        xSignature: assinatura,
        xRequestId: requisicaoId,
        dataId,
        secret: segredo,
        toleranceSeconds: 300,
    });

    return true;
}