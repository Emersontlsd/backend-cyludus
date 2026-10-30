import { Router } from "express";
import { z } from "zod";

import {
  listarCategorias,
  buscarCategoriaPorSlug,
  criarCategoria,
  atualizarCategoria,
  excluirCategoria,
} from "../modules/categories/category.service.js";

import {
  autenticarToken,
  exigirAdministrador,
} from "../middlewares/auth.middleware.js";
import {
  atualizarCategoriaSchema,
  criarCategoriaSchema,
} from "../modules/categories/category.validation.js";

const router = Router();

// lista categorias publicamente
router.get("/", async (req, res) => {
  try {
    const categorias = await listarCategorias();
    return res.status(200).json(categorias);
  } catch (erro) {
    console.error("Erro ao listar categorias: ".erro);
    return res.status(500).json({
      mensagem: "Não foi possível listar as categorias.",
    });
  }
});

// buscar categoria por slug
router.get("/:slug", async (req, res) => {
  try {
    const categoria = await buscarCategoriaPorSlug(req.params.slug);

    if (!categoria) {
      return res.status(404).json({
        mensagem: "Categoria não encontrada.",
      });
    }

    return res.status(200).json(categoria);
  } catch (erro) {
    console.error("Erro ao buscar categoria: ", erro);
    return res.status(500).json({
      mensagem: "Não foi possível buscar a categoria.",
    });
  }
});

// cadastra categoria, somente admin
router.post("/", autenticarToken, exigirAdministrador, async (req, res) => {
  const validacao = criarCategoriaSchema.safeParse(req.body);

  if (!validacao.success) {
    return res.status(400).json({
      mensagem: "Os dados da categoria são inválidos.",
      erros: validacao.error.issues.map((erro) => ({
        campo: erro.path.join("."),
        mensagem: erro.message,
      })),
    });
  }

  try {
    const categoria = await criarCategoria(validacao.data);
    return res.status(201).json(categoria);
  } catch (erro) {
    if (
      typeof erro === "object" &&
      erro !== null &&
      "code" in erro &&
      erro.code === "P2002"
    ) {
      return res.status(409).json({
        mensagem: "Já existe uma categoria com esse nome ou slug.",
      });
    }

    console.error("Erro ao criar categoria: ", erro);
    return res.status(500).json({
      mensagem: "Não foi possível criar a categoria.",
    });
  }
});

// Atualiza parcialmente uma categoria. Somente admin.
router.patch("/:id", autenticarToken, exigirAdministrador, async (req, res) => {
  const idValido = z.string().uuid().safeParse(req.params.id);

  if (!idValido.success) {
    return res.status(400).json({
      mensagem: "O ID da categoria é inválido.",
    });
  }

  const validacao = atualizarCategoriaSchema.safeParse(req.body);

  if (!validacao.success) {
    return res.status(400).json({
      mensagem: "Os dados da categoria são inválidos.",
      erros: validacao.error.issues.map((erro) => ({
        campo: erro.path.join("."),
        mensagem: erro.message,
      })),
    });
  }

  try {
    const categoria = await atualizarCategoria(idValido.data, validacao.data);

    return res.status(200).json(categoria);
  } catch (erro) {
    if (
      typeof erro === "object" &&
      erro !== null &&
      "code" in erro &&
      erro.code === "P2025"
    ) {
      return res.status(404).json({
        mensagem: "Categoria não encontrada.",
      });
    }

    if (
      typeof erro === "object" &&
      erro !== null &&
      "code" in erro &&
      erro.code === "P2002"
    ) {
      return res.status(409).json({
        mensagem: "Já existe uma categoria com esse nome ou slug.",
      });
    }

    console.error("Erro ao atualizar categoria: ", erro);
    return res.status(500).json({
      mensagem: "Não foi possível atualizar a categoria.",
    });
  }
});

// Exclui uma categoria. Somente admin.
router.delete(
  "/:id",
  autenticarToken,
  exigirAdministrador,
  async (req, res) => {
    const idValido = z.string().uuid().safeParse(req.params.id);

    if (!idValido.success) {
      return res.status(400).json({
        mensagem: "O ID da categoria é inválido.",
      });
    }

    try {
      const categoria = await excluirCategoria(idValido.data);

      return res.status(200).json({
        mensagem: "Categoria excluída com sucesso.",
        categoria,
      });
    } catch (erro) {
      if (
        typeof erro === "object" &&
        erro !== null &&
        "code" in erro &&
        erro.code === "P2025"
      ) {
        return res.status(404).json({
          mensagem: "Categoria não encontrada.",
        });
      }

      console.error("Erro ao excluir categoria: ", erro);
      return res.status(500).json({
        mensagem: "Não foi possível excluir a categoria.",
      });
    }
  },
);

export default router;
