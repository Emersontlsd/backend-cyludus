import { Router } from "express";

import { autenticarToken } from "../middlewares/auth.middleware.js";
import { criarPagamentoSchema } from "../modules/payments/payment.validation.js";
import { criarCheckoutPagamento } from "../modules/payments/payment.service.js";

const router = Router();

// Todas as rotas exigem autenticação.
router.use(autenticarToken);

// Criar ou recuperar checkout de uma inscrição.
router.post("/checkout", async (req, res) => {
  const validacao = criarPagamentoSchema.safeParse(req.body);

  if (!validacao.success) {
    return res.status(400).json({
      mensagem: "Dados inválidos.",
      erros: validacao.error.flatten(),
    });
  }

  try {
    const pagamento = await criarCheckoutPagamento(
      req.usuario.id,
      validacao.data.enrollmentId,
    );

    return res.status(200).json({
      mensagem: "Checkout de pagamento criado ou recuperado com sucesso.",
      pagamento,
    });
  } catch (erro) {
    console.error("Erro ao criar checkout de pagamento:", erro);

    return res.status(erro.statusCode || 500).json({
      mensagem: erro.statusCode
        ? erro.message
        : "Não foi possível criar o checkout de pagamento.",
    });
  }
});

export default router;