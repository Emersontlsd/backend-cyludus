import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// simula o prisma para impedir qualquer conexao com o banco real
vi.mock("../src/config/prisma.ts", () => ({
  prisma: {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import authRoutes from "../src/routes/auth.routes.js";
import userRoutes from "../src/routes/user.routes.js";

import { prisma } from "../src/config/prisma.ts";

const app = express();

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

describe("Rotas de autenticação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Deve rejeitar cadastro com dados inválidos", async () => {
    const resposta = await request(app).post("/api/auth/register").send({
      name: "Jo",
      email: "email-invalido",
      password: "123",
    });

    expect(resposta.status).toBe(400);
    expect(resposta.body.mensagem).toBe("Os dados do cadastro são inválidos.");

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("deve rejeitar acesso a /me sem token", async () => {
    const resposta = await request(app).get("/api/auth/me");

    expect(resposta.status).toBe(401);
    expect(resposta.body.mensagem).toBe("Token de autenticação não informado.");

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("deve cadastrat um usuário com dados válidos", async () => {
    const usuarioCriado = {
      id: "usuario-teste-123",
      name: "Emerson Souza",
      email: "emerson@teste.com",
      role: "USER",
      isActive: true,
      createdAt: new Date("2026-01-01T12:00:00.000Z"),
    };

    prisma.user.create.mockResolvedValue(usuarioCriado);

    const resposta = await request(app).post("/api/auth/register").send({
      name: "Emerson Souza",
      email: "emerson@teste.com",
      password: "SenhaSegura123",
    });

    expect(resposta.status).toBe(201);

    expect(resposta.body.mensagem).toBe("Usuário cadastrado com sucesso.");

    expect(resposta.body.usuario).toMatchObject({
      id: "usuario-teste-123",
      name: "Emerson Souza",
      email: "emerson@teste.com",
      role: "USER",
      isActive: true,
    });

    expect(prisma.user.create).toHaveBeenCalledOnce();
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Emerson Souza",
          email: "emerson@teste.com",
          role: "USER",
        }),
      }),
    );
  });

  it("deve autenticar um usuário com credenciais válidas", async () => {
    const senhaHash = await bcrypt.hash("SenhaSegura123", 4);

    const usuario = {
      id: "usuario-teste-123",
      name: "Emerson Souza",
      email: "emerson@teste.com",
      passwordHash: senhaHash,
      role: "USER",
      isActive: true,
    };

    prisma.user.findUnique.mockResolvedValue(usuario);

    const resposta = await request(app).post("/api/auth/login").send({
      email: "emerson@teste.com",
      password: "SenhaSegura123",
    });

    expect(resposta.status).toBe(200);

    expect(resposta.body.usuario).toEqual({
      id: "usuario-teste-123",
      name: "Emerson Souza",
      email: "emerson@teste.com",
      role: "USER",
    });

    expect(resposta.body.token).toBeTypeOf("string");

    const payload = jwt.verify(resposta.body.token, process.env.JWT_SECRET);

    expect(payload.sub).toBe("usuario-teste-123");
    expect(payload.role).toBe("USER");

    expect(prisma.user.findUnique).toHaveBeenCalledOnce();
  });

  it("deve rejeitar login com senha incorreta", async () => {
    const senhaHash = await bcrypt.hash("SenhaCorreta123", 4);

    prisma.user.findUnique.mockResolvedValue({
      id: "usuario-teste-123",
      name: "Emerson Souza",
      email: "emerson@teste.com",
      passwordHash: senhaHash,
      role: "USER",
      isActive: true,
    });

    const resposta = await request(app).post("/api/auth/login").send({
      email: "emerson@teste.com",
      password: "SenhaErrada123",
    });

    expect(resposta.status).toBe(401);

    expect(resposta.body.mensagem).toBe("E-mail e/ou senha incorretos.");

    expect(resposta.body.token).toBeUndefined();
    expect(prisma.user.findUnique).toHaveBeenCalledOnce();
  });

  it("deve retornar os dados do usuário com token válido", async () => {
    const usuario = {
      id: "usuario-teste-123",
      name: "Emerson Souza",
      email: "emerson@teste.com",
      role: "USER",
      isActive: true,
    };

    prisma.user.findUnique.mockResolvedValue(usuario);

    const token = jwt.sign({ role: "USER" }, process.env.JWT_SECRET, {
      subject: usuario.id,
      expiresIn: "15m",
    });

    const resposta = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(resposta.status).toBe(200);

    expect(resposta.body.usuario).toEqual(usuario);

    expect(prisma.user.findUnique).toHaveBeenCalledOnce();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: {
        id: usuario.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });
  });

  it("deve rejeitar acesso com token inválido", async () => {
    const resposta = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer token-inválido");

    expect(resposta.status).toBe(401);

    expect(resposta.body.mensagem).toBe("Token inválido ou expirado.");

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("deve bloquear acesso de usuário inativo", async () => {
    const usuario = {
      id: "usuario-teste-123",
      name: "Emerson Souza",
      email: "emerson@teste.com",
      role: "USER",
      isActive: false,
    };

    prisma.user.findUnique.mockResolvedValue(usuario);

    const token = jwt.sign({ role: "USER" }, process.env.JWT_SECRET, {
      subject: usuario.id,
      expiresIn: "15m",
    });

    const resposta = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(resposta.status).toBe(401);

    expect(resposta.body.mensagem).toBe("Usuário inválido ou inativo.");

    expect(prisma.user.findUnique).toHaveBeenCalledOnce();
  });

  it("deve bloquear usuário comum na rota administrativa", async () => {
    const usuario = {
      id: "usuario-comum-123",
      name: "Usuário Comum",
      email: "usuario@teste.com",
      role: "USER",
      isActive: true,
    };

    prisma.user.findUnique.mockResolvedValue(usuario);

    const token = jwt.sign({ role: "USER" }, process.env.JWT_SECRET, {
      subject: usuario.id,
      expiresIn: "15m",
    });

    const resposta = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${token}`);

    expect(resposta.status).toBe(403);

    expect(resposta.body.mensagem).toBe(
      "Acesso permitido apenas para administradores.",
    );

    expect(prisma.user.findUnique).toHaveBeenCalledOnce();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("deve permitir que o administrado acesse a rota de usuários", async () => {
    const administrador = {
      id: "admin-teste-123",
      name: "Administrador",
      email: "admin@teste.com",
      role: "ADMIN",
      isActive: true,
    };

    prisma.user.findUnique.mockResolvedValue(administrador);
    prisma.user.findMany.mockResolvedValue([]);

    const token = jwt.sign({ role: "ADMIN" }, process.env.JWT_SECRET, {
      subject: administrador.id,
      expiresIn: "15m",
    });

    const resposta = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${token}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual([]);

    expect(prisma.user.findUnique).toHaveBeenCalledOnce();
    expect(prisma.user.findMany).toHaveBeenCalledOnce();
  });

  it("deve impedir que administrador desative a própria conta", async () => {
    const administrador = {
      id: "admin-teste-123",
      name: "Administrador",
      email: "admin@teste.com",
      role: "ADMIN",
      isActive: true,
    };

    prisma.user.findUnique.mockResolvedValue(administrador);

    const token = jwt.sign({ role: "ADMIN" }, process.env.JWT_SECRET, {
      subject: administrador.id,
      expiresIn: "15m",
    });

    const resposta = await request(app)
      .patch(`/api/users/${administrador.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        isActive: false,
      });

    expect(resposta.status).toBe(400);

    expect(resposta.body.mensagem).toBe(
      "Você não pode desativar a própria conta.",
    );

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("deve permitir que administrador desative outro usuário", async () => {
    const administrador = {
      id: "admin-teste-123",
      name: "Administrador",
      email: "admin@teste.com",
      role: "ADMIN",
      isActive: true,
    };

    const usuarioAtualizado = {
      id: "usuario-comum-123",
      name: "Usuário Comum",
      email: "usuario@teste.com",
      role: "USER",
      isActive: false,
      createdAt: new Date("2026-01-01T12:00:00.000Z"),
      updateAt: new Date("2026-01-02T12:00:00.000Z"),
    };

    prisma.user.findUnique.mockResolvedValue(administrador);
    prisma.user.update.mockResolvedValue(usuarioAtualizado);

    const token = jwt.sign({ role: "ADMIN" }, process.env.JWT_SECRET, {
      subject: administrador.id,
      expiresIn: "15m",
    });

    const resposta = await request(app)
      .patch("/api/users/usuario-comum-123/status")
      .set("Authorization", `Bearer ${token}`)
      .send({
        isActive: false,
      });

    expect(resposta.status).toBe(200);

    expect(resposta.body.mensagem).toBe("Usuário desativado com sucesso.");

    expect(resposta.body.usuario).toMatchObject({
      id: "usuario-comum-123",
      isActive: false,
    });

    expect(prisma.user.update).toHaveBeenCalledOnce();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "usuario-comum-123",
        },
        data: {
          isActive: false,
        },
      }),
    );
  });

  
});
