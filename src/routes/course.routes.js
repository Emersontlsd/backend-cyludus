import { Router } from "express";
import { z } from "zod";

import {
  listarCursosPublicados,
  buscarCursoPorSlug,
  criarCurso,
  atualizarCurso,
  excluirCurso,
  listarTodosCursosAdmin,
} from "../modules/courses/course.service";

import { 
  criarCursoSchema, 
  atualizarCursoParcialSchema,
 } from "../modules/courses/course.validation";

import {
  autenticarToken,
  exigirAdministrador,
} from "../middlewares/auth.middleware";

const router = Router();

// Get api/courses
router.get("/", async (req, res) => {
  try {
    const cursos = await listarCursosPublicados();

    return res.status(200).json(cursos);
  } catch (erro) {
    console.error("Erro ao listar cursos: ", erro);

    return res.status(500).json({
      mensagem: "Não foi possível consultar os cursos.",
    });
  }
});

// Get api/courses ADMIN

router.get(
  "/admin/all",
  autenticarToken,
  exigirAdministrador,
  async (req, res) => {
    try {
      const cursos = await listarTodosCursosAdmin();
      return res.status(200).json(cursos);
    } catch (erro) {
      console.error("Erro ao listar cursos administrativos:", erro);

      return res.status(500).json({
        mensagem: "Não foi possível consultar todos os cursos.",
      });
    }
  },
);

// GET /api/courses/:slug
router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const curso = await buscarCursoPorSlug(slug);

    if (!curso) {
      return res.status(404).json({
        mensagem: "Curso não encontrado.",
      });
    }

    return res.status(200).json(curso);
  } catch (erro) {
    console.error("Erro ao consultar curso: ", erro);

    return res.status(500).json({
      mensagem: "Não foi possível consultar o curso.",
    });
  }
});

// POST /api/courses
router.post("/", autenticarToken, exigirAdministrador, async (req, res) => {
  const validacao = criarCursoSchema.safeParse(req.body);

  if (!validacao.success) {
    return res.status(400).json({
      mensagem: "Os dados do curso são inválidos.",
      erros: validacao.error.issues.map((erro) => ({
        campo: erro.path.join("."),
        mensagem: erro.message,
      })),
    });
  }

  try {
    const curso = await criarCurso(validacao.data);

    return res.status(201).json(curso);
  } catch (erro) {
    if (
      typeof erro === "object" &&
      erro !== null &&
      "code" in erro &&
      erro.code === "P2002"
    ) {
      return res.status(409).json({
        mensagem: "Já existe um curso com esse slug.",
      });
    }

    console.error("Erro ao cadastrar curso: ", erro);

    return res.status(500).json({
      mensagem: "Não foi possível cadastrar o curso.",
    });
  }
});

router.put("/:id", autenticarToken, exigirAdministrador, async (req, res) => {
  const idValido = z.string().uuid().safeParse(req.params.id);

  if (!idValido.success) {
    return res.status(400).json({
      mensagem: "O ID do curso é inválido.",
    });
  }

  const validacao = criarCursoSchema.safeParse(req.body);

  if (!validacao.success) {
    return res.status(400).json({
      mensagem: "Os dados do curso são inválidos.",
      erros: validacao.error.issues.map((erro) => ({
        campo: erro.path.join("."),
        mensagem: erro.message,
      })),
    });
  }

  try {
    const curso = await atualizarCurso(idValido.data, validacao.data);

    return res.status(200).json(curso);
  } catch (erro) {
    if (
      typeof erro === "object" &&
      erro !== null &&
      "code" in erro &&
      erro.code === "P2025"
    ) {
      return res.status(404).json({
        mensagem: "Curso não encontrado.",
      });
    }
    if (
      typeof erro === "object" &&
      erro !== null &&
      "code" in erro &&
      erro.code === "P2002"
    ) {
      return res.status(409).json({
        mensagem: "Já existe um curso com esse slug.",
      });
    }

    console.error("Erro ao atualizar curso: ", erro);

    return res.status(500).json({
      mensagem: "Não foi possível atualizar o curso.",
    });
  }
});


router.patch(
  "/:id",
  autenticarToken,
  exigirAdministrador,
  async (req, res) => {
    const idValido = z.string().uuid().safeParse(req.params.id);

    if (!idValido.success) {
      return res.status(400).json({
        mensagem: "O ID do curso é inválido.",
      });
    }

    const validacao = atualizarCursoParcialSchema.safeParse(req.body);

    if (!validacao.success) {
      return res.status(400).json({
        mensagem: "Os dados do curso são inválidos.",
        erros: validacao.error.issues.map((erro) => ({
          campo: erro.path.join("."),
          mensagem: erro.message,
        })),
      });
    }

    try {
      const curso = await atualizarCurso(
        idValido.data,
        validacao.data,
      );

      return res.status(200).json(curso);
    } catch (erro) {
      if (
        typeof erro === "object" &&
        erro !== null &&
        "code" in erro &&
        erro.code === "P2025"
      ) {
        return res.status(404).json({
          mensagem: "Curso não encontrado.",
        });
      }

      if (
        typeof erro === "object" &&
        erro !== null &&
        "code" in erro &&
        erro.code === "P2002"
      ) {
        return res.status(409).json({
          mensagem: "Já existe um curso com esse slug.",
        });
      }

      console.error("Erro ao atualizar parcialmente o curso:", erro);

      return res.status(500).json({
        mensagem: "Não foi possível atualizar o curso.",
      });
    }
  },
);


router.delete(
  "/:id",
  autenticarToken,
  exigirAdministrador,
  async (req, res) => {
    const idValido = z.string().uuid().safeParse(req.params.id);

    if (!idValido.success) {
      return res.status(400).json({
        mensagem: "O ID do curso é inválido.",
      });
    }
    try {
      const curso = await excluirCurso(idValido.data);

      return res.status(200).json({
        mensagem: "Curso excluído com sucesso.",
        curso,
      });
    } catch (erro) {
      if (
        typeof erro === "object" &&
        erro !== null &&
        "code" in erro &&
        erro.code === "P2025"
      ) {
        return res.status(404).json({
          mensagem: "Curso não encontrado.",
        });
      }

      console.error("Erro ao excluir curso: ", erro);

      return res.status(500).json({
        mensagem: "Não foi possível excluir o curso.",
      });
    }
  },
);

export default router;
