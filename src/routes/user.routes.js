import { Router } from "express";
import { z } from "zod";

import {
  listarUsuarios,
  buscarUsuarioPorId,
  alterarStatusUsuario,
} from "../modules/users/user.service.js";

import {
  autenticarToken,
  exigirAdministrador,
} from "../middlewares/auth.middleware.js";

const router = Router();

router.use(autenticarToken, exigirAdministrador);

const idSchema = z.string().min(1);

const statusSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

// GET /api/users
router.get("/", async (req, res) => {
  try {
    const usuarios = await listarUsuarios();

    return res.status(200).json(usuarios);
  } catch (erro) {
    console.error("Erro ao listar usuários: ".erro);

    return res.status(500).json({
      mensagem: "Não foi possível listar os usuários.",
    });
  }
});

// GET /api/users/:id
router.get("/:id", async (req, res) => {
  const validacaoId = idSchema.safeParse(req.params.id);

  if (!validacaoId.success) {
    return res.status(400).json({
      mensagem: "O ID do usuário é inválido.",
    });
  }

  try {
    const usuario = await buscarUsuarioPorId(validacaoId.data);

    if (!usuario) {
      return res.status(404).json({
        mensagem: "Usuário não encontrado.",
      });
    }

    return res.status(200).json(usuario);
  } catch (erro) {
    console.erro("Erro ao consultar usuário: ", erro);

    return res.status(500).json({
      mensagem: "Não foi possível consultar o usuário.",
    });
  }
});

// PATCH /api/users/:id/status
router.patch("/:id/status", async (req, res) => {
  const validacaoId = idSchema.safeParse(req.params.id);
  const validacaoStatus = statusSchema.safeParse(req.body);

  if (!validacaoId.success || !validacaoStatus.success) {
    return res.status(400).json({
      mensagem: "Informe um ID e um status válido.",
    });
  }

  const { id } = req.params;
  const { isActive } = validacaoStatus.data;

  if (id === req.usuario.id && !isActive) {
    return res.status(400).json({
      mensagem: "Você não pode desativar a própria conta.",
    });
  }

  try {
    const usuario = await alterarStatusUsuario(validacaoId.data, isActive);

    return res.status(200).json({
      mensagem: isActive
        ? "Usuário ativado com sucesso."
        : "Usuário desativado com sucesso.",
      usuario,
    });
  } catch (erro) {
    if (erro?.code === "P2025") {
      return res.status(404).json({
        mensagem: "Usuário não encontrado.",
      });
    }

    console.error("Erro ao alterar status do usuário: ", erro);

    return res.status(500).json({
        mensagem: "Não foi possível alterar o status do usuário.",
    });
  }
});

export default router;
