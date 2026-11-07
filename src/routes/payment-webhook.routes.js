import { Router } from "express";
import { InvalidWebhookSignatureError } from "mercadopago";

import { validarAssinaturaWebhook } from "../modules/payments/mercadopago-webhook.service.js";
import { processarWebhookPagamento } from "../modules/payments/payment-webhook.orchestrator.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    validarAssinaturaWebhook({
      assinatura: req.headers["x-signature"],
      requisicaoId: req.headers["x-request-id"],
      dataId: req.query["data.id"],
    });

    // A assinatura deve ser validada antes de qualquer
    // consulta ou alteração financeira.
    const orderId = req.query["data.id"];

    await processarWebhookPagamento({ orderId });

    // Confirma o recebimento somente após o processamento.
    return res.status(200).json({
      mensagem: "Notificação processada com sucesso.",
    });
  } catch (erro) {
    if (erro instanceof InvalidWebhookSignatureError) {
      return res.status(401).json({
        mensagem: "Assinatura do webhook inválida.",
      });
    }

    console.error("Erro ao processar webhook do Mercado Pago:", erro);

    // Erro de configuração: o segredo necessário para validar
    // a autenticidade da notificação não está disponível.
    if (
      !process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() &&
      erro?.statusCode === 500
    ) {
      return res.status(500).json({
        mensagem: "Não foi possível validar o webhook.",
      });
    }

    // Falhas financeiras não devem ser confirmadas como sucesso.
    return res.status(503).json({
      mensagem: "Não foi possível processar o webhook.",
    });
  }
});

export default router;
