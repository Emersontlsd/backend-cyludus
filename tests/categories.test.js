
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../src/config/prisma.ts", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "../src/config/prisma.ts";
import categoryRoutes from "../src/routes/category.routes.js";

const app = express();
app.use(express.json());
app.use("/api/categories", categoryRoutes);

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";

const categoriaValida = {
  name: "Programação",
  slug: "programacao",
};

function gerarToken(id) {
  return jwt.sign({}, process.env.JWT_SECRET, {
    subject: id,
    expiresIn: "15m",
  });
}

const tokenAdmin = gerarToken(ADMIN_ID);
const tokenUsuario = gerarToken(USER_ID);

describe("Testes das rotas de categorias", () => {
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

  it("deve listar categorias publicamente", async () => {
    prisma.category.findMany.mockResolvedValue([categoriaValida]);

    const resposta = await request(app).get("/api/categories");

    expect(resposta.status).toBe(200);
    expect(resposta.body).toHaveLength(1);
    expect(prisma.category.findMany).toHaveBeenCalled();
  });

  it("deve buscar uma categoria pelo slug", async () => {
    prisma.category.findUnique.mockResolvedValue(categoriaValida);

    const resposta = await request(app)
      .get("/api/categories/programacao");

    expect(resposta.status).toBe(200);
    expect(resposta.body.slug).toBe("programacao");
    expect(prisma.category.findUnique).toHaveBeenCalled();
  });

  it("deve retornar 404 quando a categoria não existir", async () => {
    prisma.category.findUnique.mockResolvedValue(null);

    const resposta = await request(app)
      .get("/api/categories/categoria-inexistente");

    expect(resposta.status).toBe(404);
  });

  it("deve cadastrar categoria com dados válidos", async () => {
    prisma.category.create.mockResolvedValue({
      id: CATEGORY_ID,
      ...categoriaValida,
    });

    const resposta = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send(categoriaValida);

    expect(resposta.status).toBe(201);
    expect(resposta.body.name).toBe("Programação");
    expect(prisma.category.create).toHaveBeenCalled();
  });

  it("deve rejeitar cadastro com dados inválidos", async () => {
    const resposta = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({
        name: "A",
        slug: "Slug Inválido",
      });

    expect(resposta.status).toBe(400);
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it("deve bloquear cadastro sem token", async () => {
    const resposta = await request(app)
      .post("/api/categories")
      .send(categoriaValida);

    expect(resposta.status).toBe(401);
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it("deve bloquear usuário comum no cadastro", async () => {
    const resposta = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${tokenUsuario}`)
      .send(categoriaValida);

    expect(resposta.status).toBe(403);
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it("deve retornar 409 para categoria duplicada", async () => {
    prisma.category.create.mockRejectedValue({
      code: "P2002",
    });

    const resposta = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send(categoriaValida);

    expect(resposta.status).toBe(409);
  });

  it("deve atualizar parcialmente uma categoria", async () => {
    prisma.category.update.mockResolvedValue({
      id: CATEGORY_ID,
      ...categoriaValida,
      name: "Desenvolvimento",
    });

    const resposta = await request(app)
      .patch(`/api/categories/${CATEGORY_ID}`)
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({
        name: "Desenvolvimento",
      });

    expect(resposta.status).toBe(200);
    expect(prisma.category.update).toHaveBeenCalled();
  });

  it("deve rejeitar atualização com ID inválido", async () => {
    const resposta = await request(app)
      .patch("/api/categories/id-invalido")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({
        name: "Desenvolvimento",
      });

    expect(resposta.status).toBe(400);
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("deve rejeitar atualização sem campos", async () => {
    const resposta = await request(app)
      .patch(`/api/categories/${CATEGORY_ID}`)
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({});

    expect(resposta.status).toBe(400);
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("deve retornar 404 ao atualizar categoria inexistente", async () => {
    prisma.category.update.mockRejectedValue({
      code: "P2025",
    });

    const resposta = await request(app)
      .patch(`/api/categories/${CATEGORY_ID}`)
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({
        name: "Desenvolvimento",
      });

    expect(resposta.status).toBe(404);
  });

  it("deve retornar 409 ao atualizar para nome ou slug duplicado", async () => {
    prisma.category.update.mockRejectedValue({
      code: "P2002",
    });

    const resposta = await request(app)
      .patch(`/api/categories/${CATEGORY_ID}`)
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({
        name: "Desenvolvimento",
      });

    expect(resposta.status).toBe(409);
  });

  it("deve excluir uma categoria", async () => {
    prisma.category.delete.mockResolvedValue({
      id: CATEGORY_ID,
      ...categoriaValida,
    });

    const resposta = await request(app)
      .delete(`/api/categories/${CATEGORY_ID}`)
      .set("Authorization", `Bearer ${tokenAdmin}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.mensagem).toBe(
      "Categoria excluída com sucesso."
    );
    expect(prisma.category.delete).toHaveBeenCalled();
  });

  it("deve retornar 404 ao excluir categoria inexistente", async () => {
    prisma.category.delete.mockRejectedValue({
      code: "P2025",
    });

    const resposta = await request(app)
      .delete(`/api/categories/${CATEGORY_ID}`)
      .set("Authorization", `Bearer ${tokenAdmin}`);

    expect(resposta.status).toBe(404);
  });

  it("deve bloquear usuário comum na exclusão", async () => {
    const resposta = await request(app)
      .delete(`/api/categories/${CATEGORY_ID}`)
      .set("Authorization", `Bearer ${tokenUsuario}`);

    expect(resposta.status).toBe(403);
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });

  it("deve bloquear administrador com conta inativa", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: ADMIN_ID,
      role: "ADMIN",
      isActive: false,
    });

    const resposta = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send(categoriaValida);

    expect(resposta.status).toBe(401);
    expect(prisma.category.create).not.toHaveBeenCalled();
  });
});
