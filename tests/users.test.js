
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../src/config/prisma.ts", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "../src/config/prisma.ts";
import userRoutes from "../src/routes/user.routes.js";

const app = express();

app.use(express.json());
app.use("/api/users", userRoutes);

const ADMIN_ID = "c123456789012345678901234";
const USER_ID = "c223456789012345678901234";

const administrador = {
  id: ADMIN_ID,
  name: "Administrador",
  email: "admin@teste.com",
  role: "ADMIN",
  isActive: true,
};

const usuarioComum = {
  id: USER_ID,
  name: "Usuário Comum",
  email: "usuario@teste.com",
  role: "USER",
  isActive: true,
  createdAt: new Date("2026-01-01T12:00:00.000Z"),
  updatedAt: new Date("2026-01-02T12:00:00.000Z"),
};

function gerarToken(id = ADMIN_ID) {
  return jwt.sign({}, process.env.JWT_SECRET, {
    subject: id,
    expiresIn: "15m",
  });
}

describe("Rotas de usuários", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(administrador);
  });

  describe("Autenticação e autorização", () => {
    it("deve impedir acesso sem token", async () => {
      const resposta = await request(app).get("/api/users");

      expect(resposta.status).toBe(401);
      expect(resposta.body.mensagem).toBe(
        "Token de autenticação não informado."
      );
    });

    it("deve impedir acesso com token inválido", async () => {
      const resposta = await request(app)
        .get("/api/users")
        .set("Authorization", "Bearer token-invalido");

      expect(resposta.status).toBe(401);
    });

    it("deve impedir acesso de usuário comum", async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...administrador,
        role: "USER",
      });

      const resposta = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${gerarToken()}`);

      expect(resposta.status).toBe(403);
      expect(resposta.body.mensagem).toBe(
        "Acesso permitido apenas para administradores."
      );
    });

    it("deve impedir acesso quando o administrador está inativo", async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...administrador,
        isActive: false,
      });

      const resposta = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${gerarToken()}`);

      expect(resposta.status).toBe(401);
    });
  });

  describe("GET /api/users", () => {
    it("deve listar os usuários", async () => {
      prisma.user.findMany.mockResolvedValue([
        administrador,
        usuarioComum,
      ]);

      const resposta = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${gerarToken()}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toHaveLength(2);
      expect(resposta.body[0].email).toBe("admin@teste.com");
      expect(prisma.user.findMany).toHaveBeenCalledOnce();
    });

    it("deve retornar lista vazia quando não houver usuários", async () => {
      prisma.user.findMany.mockResolvedValue([]);

      const resposta = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${gerarToken()}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toEqual([]);
    });

    it("deve retornar erro 500 quando ocorrer falha ao listar usuários", async () => {
      prisma.user.findMany.mockRejectedValue(
        new Error("Erro simulado no banco de dados")
      );

      const resposta = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${gerarToken()}`);

      expect(resposta.status).toBe(500);
      expect(resposta.body.mensagem).toBe(
        "Não foi possível listar os usuários."
      );
    });
  });

  describe("GET /api/users/:id", () => {
    it("deve consultar um usuário pelo ID", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(administrador)
        .mockResolvedValueOnce(usuarioComum);

      const resposta = await request(app)
        .get(`/api/users/${USER_ID}`)
        .set("Authorization", `Bearer ${gerarToken()}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.id).toBe(USER_ID);
      expect(resposta.body.email).toBe("usuario@teste.com");
    });

    it("deve retornar 400 quando o ID for inválido", async () => {
      const resposta = await request(app)
        .get("/api/users/id-invalido")
        .set("Authorization", `Bearer ${gerarToken()}`);

      expect(resposta.status).toBe(400);
      expect(resposta.body.mensagem).toBe(
        "O ID do usuário é inválido."
      );
    });

    it("deve retornar 404 quando o usuário não existir", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(administrador)
        .mockResolvedValueOnce(null);

      const resposta = await request(app)
        .get(`/api/users/${USER_ID}`)
        .set("Authorization", `Bearer ${gerarToken()}`);

      expect(resposta.status).toBe(404);
      expect(resposta.body.mensagem).toBe("Usuário não encontrado.");
    });

    it("deve retornar 500 quando ocorrer falha na consulta", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(administrador)
        .mockRejectedValueOnce(new Error("Erro simulado"));

      const resposta = await request(app)
        .get(`/api/users/${USER_ID}`)
        .set("Authorization", `Bearer ${gerarToken()}`);

      expect(resposta.status).toBe(500);
      expect(resposta.body.mensagem).toBe(
        "Não foi possível consultar o usuário."
      );
    });
  });

  describe("PATCH /api/users/:id/status", () => {
    it("deve permitir que administrador desative outro usuário", async () => {
      const usuarioAtualizado = {
        ...usuarioComum,
        isActive: false,
      };

      prisma.user.update.mockResolvedValue(usuarioAtualizado);

      const resposta = await request(app)
        .patch(`/api/users/${USER_ID}/status`)
        .set("Authorization", `Bearer ${gerarToken()}`)
        .send({ isActive: false });

      expect(resposta.status).toBe(200);
      expect(resposta.body.mensagem).toBe(
        "Usuário desativado com sucesso."
      );
      expect(resposta.body.usuario.isActive).toBe(false);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID },
          data: { isActive: false },
        })
      );
    });

    it("deve permitir que administrador ative outro usuário", async () => {
      prisma.user.update.mockResolvedValue({
        ...usuarioComum,
        isActive: true,
      });

      const resposta = await request(app)
        .patch(`/api/users/${USER_ID}/status`)
        .set("Authorization", `Bearer ${gerarToken()}`)
        .send({ isActive: true });

      expect(resposta.status).toBe(200);
      expect(resposta.body.mensagem).toBe(
        "Usuário ativado com sucesso."
      );
    });

    it("deve impedir que administrador desative a própria conta", async () => {
      const resposta = await request(app)
        .patch(`/api/users/${ADMIN_ID}/status`)
        .set("Authorization", `Bearer ${gerarToken()}`)
        .send({ isActive: false });

      expect(resposta.status).toBe(400);
      expect(resposta.body.mensagem).toBe(
        "Você não pode desativar a própria conta."
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("deve retornar 400 quando o ID for inválido", async () => {
      const resposta = await request(app)
        .patch("/api/users/id-invalido/status")
        .set("Authorization", `Bearer ${gerarToken()}`)
        .send({ isActive: false });

      expect(resposta.status).toBe(400);
    });

    it("deve retornar 400 quando o status não for booleano", async () => {
      const resposta = await request(app)
        .patch(`/api/users/${USER_ID}/status`)
        .set("Authorization", `Bearer ${gerarToken()}`)
        .send({ isActive: "false" });

      expect(resposta.status).toBe(400);
    });

    it("deve retornar 400 quando o corpo estiver vazio", async () => {
      const resposta = await request(app)
        .patch(`/api/users/${USER_ID}/status`)
        .set("Authorization", `Bearer ${gerarToken()}`)
        .send({});

      expect(resposta.status).toBe(400);
    });

    it("deve rejeitar propriedades adicionais no corpo da requisição", async () => {
      const resposta = await request(app)
        .patch(`/api/users/${USER_ID}/status`)
        .set("Authorization", `Bearer ${gerarToken()}`)
        .send({
          isActive: false,
          role: "ADMIN",
        });

      expect(resposta.status).toBe(400);
    });

    it("deve retornar 404 quando o usuário não existir", async () => {
      const erro = new Error("Registro não encontrado");
      erro.code = "P2025";

      prisma.user.update.mockRejectedValue(erro);

      const resposta = await request(app)
        .patch(`/api/users/${USER_ID}/status`)
        .set("Authorization", `Bearer ${gerarToken()}`)
        .send({ isActive: false });

      expect(resposta.status).toBe(404);
      expect(resposta.body.mensagem).toBe("Usuário não encontrado.");
    });

    it("deve retornar 500 quando ocorrer falha ao alterar o status", async () => {
      prisma.user.update.mockRejectedValue(
        new Error("Erro simulado no banco de dados")
      );

      const resposta = await request(app)
        .patch(`/api/users/${USER_ID}/status`)
        .set("Authorization", `Bearer ${gerarToken()}`)
        .send({ isActive: false });

      expect(resposta.status).toBe(500);
      expect(resposta.body.mensagem).toBe(
        "Não foi possível alterar o status do usuário."
      );
    });
  });
});
