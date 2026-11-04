import { Router } from "express";
import { InvalidWebhookSignatureError } from "mercadopago";

import {
  validarAssinaturaWebhook,
} from "../modules/payments/mercadopago-webhook.service.js";

const router = Router();

router.post("/", (req, res) => {
    try {
        validarAssinaturaWebhook({
            assinatura: req.headers["x-signature"],
            requisicaoId: req.headers["x-request-id"],
            dataId: req.query["data.id"],
        });

        // A confirmação do pagamento será implementada na próxima etapa.
        // Não confirmar o recebimento enquanto não houver processamento.
        return res.status(503).json({
            mensagem: "Processamento do webhook ainda não está disponível.",
        });
    } catch (erro) {
        if (erro instanceof InvalidWebhookSignatureError) {
            return res.status(401).json({
                mensagem: "Assinatura do webhook inválida.",
            });
        }

        console.error("Erro ao validar webhook do Mercado Pago: ", erro);

        return res.status(erro.statusCode || 500).json({
            mensagem: erro.statusCode
                ? erro.message
                : "Não foi possível validar o webhook.",
        });
    }
});

export default router;