import { Router } from "express";

import { autenticarToken } from "../middlewares/auth.middleware.js";
import { criarInscricaoSchema } from "../modules/enrollments/enrollment.validation.js";
import { criarInscricao } from "../modules/enrollments/enrollment.service.js";

const router = Router();

// todas rotas de inscricao exigem autenticacao
router.use(autenticarToken);

// criar inscricao em um curso
router.post("/", async (req, res) => {
    const validacao = criarInscricaoSchema.safeParse(req.body);

    if (!validacao.success) {
        return res.status(400).json({
            mensagem: "Dados inválidos.",
            erros: validacao.error.flatten(),
        });
    }

    try {
        const inscricao = await criarInscricao(
            req.usuario.id,
            validacao.data.courseId
        );

        return res.status(201).json({
            mensagem: "Inscrição criada. Você tem 24 horas para realizar o pagamento.",
            inscricao,
        });
    } catch (erro) {
        console.error("Erro ao criar inscrição: ", erro);

        return res.status(erro.statusCode || 500).json({
            mensagem: 
                erro.statusCode
                    ? erro.message
                    : "Não foi possível criar a inscrição.",
        });
    }
});

export default router;