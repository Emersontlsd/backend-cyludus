import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../src/config/prisma.ts", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    course: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "../src/config/prisma.ts";
import courseRoutes from "../src/routes/course.routes.js";

const app = express();
app.use(express.json());
app.use("/api/courses", courseRoutes);

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const COURSE_ID = "33333333-3333-4333-8333-333333333333";

const cursoValido = {
  title: "Curso de JavaScript",
  slug: "curso-javascript",
  description: "Curso completo de JavaScript.",
  price: 199.9,
  isPublished: true,
  imageUrl: "https://exemplo.com/curso.jpg",
  instructorImageUrl: "https://exemplo.com/instrutor.jpg",
  badge: "Destaque",
  instructorDescription: "Instrutor de programação.",
  observations: "Acesso online.",
  subjects: ["JavaScript", "Node.js"],
  schedule: [
    {
      title: "Módulo 1",
      description: "Introdução",
      date: "01/11/2026",
    },
  ],
};

function gerarToken(id) {
  return jwt.sign({}, process.env.JWT_SECRET, {
    subject: id,
    expiresIn: "15m",
  });
}

const tokenAdmin = gerarToken(ADMIN_ID);
const tokenUsuario = gerarToken(USER_ID);

describe("Testes das rotas de cursos", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.user.findUnique.mockImplementation(({ where }) => {
      if (where.id === ADMIN_ID) {
        return Promise.resolve({
          id: ADMIN_ID,
          role: "ADMIN",
          isActive: true,
        });
      }

      if (where.id === USER_ID) {
        return Promise.resolve({
          id: USER_ID,
          role: "USER",
          isActive: true,
        });
      }

      return Promise.resolve(null);
    });
  });

  it("deve listar os cursos publicados", async () => {
    prisma.course.findMany.mockResolvedValue([cursoValido]);

    const resposta = await request(app).get("/api/courses");

    expect(resposta.status).toBe(200);
    expect(resposta.body).toHaveLength(1);
    expect(prisma.course.findMany).toHaveBeenCalled();
  });

  it("deve consultar um curso pelo slug", async () => {
    prisma.course.findFirst.mockResolvedValue(cursoValido);

    const resposta = await request(app).get("/api/courses/curso-javascript");

    expect(resposta.status).toBe(200);
    expect(resposta.body.slug).toBe("curso-javascript");
    expect(prisma.course.findFirst).toHaveBeenCalled();
  });

  it("deve retornar 404 quando o curso não existir", async () => {
    prisma.course.findFirst.mockResolvedValue(null);

    const resposta = await request(app).get("/api/courses/curso-inexistente");

    expect(resposta.status).toBe(404);
  });

  it("deve bloquear a listagem administrativa sem token", async () => {
    const resposta = await request(app).get("/api/courses/admin/all");

    expect(resposta.status).toBe(401);
    expect(prisma.course.findMany).not.toHaveBeenCalled();
  });

  it("deve bloquear usuário comum na listagem administrativa", async () => {
    const resposta = await request(app)
      .get("/api/courses/admin/all")
      .set("Authorization", `Bearer ${tokenUsuario}`);

    expect(resposta.status).toBe(403);
    expect(prisma.course.findMany).not.toHaveBeenCalled();
  });

  it("deve permitir administrador listar todos os cursos", async () => {
    prisma.course.findMany.mockResolvedValue([cursoValido]);

    const resposta = await request(app)
      .get("/api/courses/admin/all")
      .set("Authorization", `Bearer ${tokenAdmin}`);

    expect(resposta.status).toBe(200);
    expect(prisma.course.findMany).toHaveBeenCalled();
  });

  it("deve cadastrar um curso com dados válidos", async () => {
    prisma.course.create.mockResolvedValue({
      id: COURSE_ID,
      ...cursoValido,
    });

    const resposta = await request(app)
      .post("/api/courses")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send(cursoValido);

    expect(resposta.status).toBe(201);
    expect(resposta.body.title).toBe(cursoValido.title);
    expect(prisma.course.create).toHaveBeenCalled();
  });

  it("deve rejeitar cadastro com dados inválidos", async () => {
    const resposta = await request(app)
      .post("/api/courses")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({
        title: "AB",
        slug: "Curso Inválido",
        price: -10,
      });

    expect(resposta.status).toBe(400);
    expect(prisma.course.create).not.toHaveBeenCalled();
  });

  it("deve rejeitar atualização com ID inválido", async () => {
    const resposta = await request(app)
      .put("/api/courses/id-invalido")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send(cursoValido);

    expect(resposta.status).toBe(400);
    expect(prisma.course.update).not.toHaveBeenCalled();
  });

  it("deve rejeitar atualização parcial sem campos", async () => {
    const resposta = await request(app)
      .patch(`/api/courses/${COURSE_ID}`)
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({});

    expect(resposta.status).toBe(400);
    expect(prisma.course.update).not.toHaveBeenCalled();
  });

  it("deve atualizar um curso", async () => {
    prisma.course.update.mockResolvedValue({
      id: COURSE_ID,
      ...cursoValido,
    });

    const resposta = await request(app)
      .put(`/api/courses/${COURSE_ID}`)
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send(cursoValido);

    expect(resposta.status).toBe(200);
    expect(prisma.course.update).toHaveBeenCalled();
  });

  it("deve excluir um curso", async () => {
    prisma.course.delete.mockResolvedValue({
      id: COURSE_ID,
      title: cursoValido.title,
      slug: cursoValido.slug,
    });

    const resposta = await request(app)
      .delete(`/api/courses/${COURSE_ID}`)
      .set("Authorization", `Bearer ${tokenAdmin}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.mensagem).toBe("Curso excluído com sucesso.");
    expect(prisma.course.delete).toHaveBeenCalled();
  });

  it("deve retornar 409 ao cadastrar curso com slug duplicado", async () => {
    prisma.course.create.mockRejectedValue({
      code: "P2002",
    });

    const resposta = await request(app)
      .post("/api/courses")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send(cursoValido);

    expect(resposta.status).toBe(409);
    expect(resposta.body.mensagem).toBe("Já existe um curso com esse slug.");
  });

  it("deve retornar 404 ao atualizar curso inexistente", async () => {
    prisma.course.update.mockRejectedValue({
      code: "P2025",
    });

    const resposta = await request(app)
      .put(`/api/courses/${COURSE_ID}`)
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send(cursoValido);

    expect(resposta.status).toBe(404);
    expect(resposta.body.mensagem).toBe("Curso não encontrado.");
  });

  it("deve retornar 404 ao excluir curso inexistente", async () => {
    prisma.course.delete.mockRejectedValue({
      code: "P2025",
    });

    const resposta = await request(app)
      .delete(`/api/courses/${COURSE_ID}`)
      .set("Authorization", `Bearer ${tokenAdmin}`);

    expect(resposta.status).toBe(404);
    expect(resposta.body.mensagem).toBe("Curso não encontrado.");
  });

  it("deve retornar 500 quando ocorrer erro ao listar cursos", async () => {
    prisma.course.findMany.mockRejectedValue(
      new Error("Erro simulado no banco de dados."),
    );

    const resposta = await request(app).get("/api/courses");

    expect(resposta.status).toBe(500);
    expect(resposta.body.mensagem).toBe(
      "Não foi possível consultar os cursos.",
    );
  });

  it("deve bloquear administrador com conta inativa", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: ADMIN_ID,
      role: "ADMIN",
      isActive: false,
    });

    const resposta = await request(app)
      .get("/api/courses/admin/all")
      .set("Authorization", `Bearer ${tokenAdmin}`);

    expect(resposta.status).toBe(401);
    expect(prisma.course.findMany).not.toHaveBeenCalled();
  });
});
