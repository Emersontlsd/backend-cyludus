import { Router } from "express";
import { z } from "zod";

import {
  autenticarUsuario,
  cadastrarUsuario,
} from "../modules/auth/auth.service.js";
import { autenticarToken } from "../middlewares/auth.middleware.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
  password: z.string().min(1, "A senha é obrigatória."),
});

const cadastroSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, "O nome deve ter pelo menos 3 caracteres.")
      .max(100, "O nome deve ter no máximo 100 caracteres."),

    email: z.string().trim().email("Informe um e-mail válido."),

    password: z
      .string()
      .min(12, "A senha deve ter pelo menos 12 caracteres.")
      .max(72, "A senha deve ter no máximo 72 caracteres."),
  })
  .strict();

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const validacao = cadastroSchema.safeParse(req.body);

  if (!validacao.success) {
    return res.status(400).json({
      mensagem: "Os dados do cadastro são inválidos.",
      erros: validacao.error.issues.map((erro) => ({
        campo: erro.path.join("."),
        mensagem: erro.message,
      })),
    });
  }

  try {
    const usuario = await cadastrarUsuario(validacao.data);

    return res.status(201).json({
      mensagem: "Usuário cadastrado com sucesso.",
      usuario,
    });
  } catch (erro) {
    if (erro?.code === "P2002") {
      return res.status(409).json({
        mensagem: "Já existe uma conta cadastrada com esse e-mail.",
      });
    }

    console.error("Erro ao cadastrar usuário:", erro);

    return res.status(500).json({
      mensagem: "Não foi possível realizar o cadastro.",
    });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const validacao = loginSchema.safeParse(req.body);

  if (!validacao.success) {
    return res.status(400).json({
      mensagem: "Informe um e-mail e uma senha válida.",
      erros: validacao.error.issues.map((erro) => ({
        campo: erro.path.join("."),
        mensagem: erro.message,
      })),
    });
  }

  try {
    const resultado = await autenticarUsuario(
      validacao.data.email,
      validacao.data.password,
    );

    if (!resultado) {
      return res.status(401).json({
        mensagem: "E-mail e/ou senha incorretos.",
      });
    }

    return res.status(200).json(resultado);
  } catch (erro) {
    console.error("Erro ao realizar login: ", erro);

    return res.status(500).json({
      mensagem: "Não foi possível realizar o login.",
    });
  }
});

// GET /api/auth/me
router.get("/me", autenticarToken, (req, res) => {
  return res.status(200).json({
    usuario: req.usuario,
  });
});

export default router;
