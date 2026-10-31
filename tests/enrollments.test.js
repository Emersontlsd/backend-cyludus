
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => {
  const txMock = {
    course: {
      findUnique: vi.fn(),
    },
    enrollment: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  };

  return {
    txMock,
    prismaMock: {
      $transaction: vi.fn(),
    },
  };
});

vi.mock("../src/config/prisma.ts", () => ({
  prisma: prismaMock,
}));

import { criarInscricao } from "../src/modules/enrollments/enrollment.service.js";

describe("Serviço de inscrições", () => {
  const userId = "usuario-123";
  const courseId = "550e8400-e29b-41d4-a716-446655440000";

  const curso = {
    id: courseId,
    title: "Curso de JavaScript",
    price: "199.90",
    isPublished: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.$transaction.mockImplementation(async (callback) => {
      return callback(txMock);
    });

    txMock.course.findUnique.mockResolvedValue(curso);
    txMock.enrollment.findFirst.mockResolvedValue(null);
    txMock.enrollment.update.mockResolvedValue({});
    txMock.enrollment.create.mockResolvedValue({
      id: "inscricao-123",
      userId,
      courseId,
      status: "PENDING",
      priceAtPurchase: "199.90",
      expiresAt: new Date("2026-11-01T12:00:00.000Z"),
      createdAt: new Date("2026-10-31T12:00:00.000Z"),
    });
  });

  it("deve criar uma inscrição para um curso publicado", async () => {
    const resultado = await criarInscricao(userId, courseId);

    expect(resultado.status).toBe("PENDING");
    expect(txMock.enrollment.create).toHaveBeenCalledOnce();

    const dados = txMock.enrollment.create.mock.calls[0][0].data;

    expect(dados.userId).toBe(userId);
    expect(dados.courseId).toBe(courseId);
    expect(dados.priceAtPurchase).toBe(curso.price);
    expect(dados.status).toBe("PENDING");
  });

  it("deve definir o prazo de pagamento em 24 horas", async () => {
    const antes = Date.now();

    await criarInscricao(userId, courseId);

    const depois = Date.now();
    const dados = txMock.enrollment.create.mock.calls[0][0].data;

    const prazoMinimo = antes + 24 * 60 * 60 * 1000;
    const prazoMaximo = depois + 24 * 60 * 60 * 1000;

    expect(dados.expiresAt.getTime()).toBeGreaterThanOrEqual(prazoMinimo);
    expect(dados.expiresAt.getTime()).toBeLessThanOrEqual(prazoMaximo);
  });

  it("não deve permitir inscrição em curso não publicado", async () => {
    txMock.course.findUnique.mockResolvedValue({
      ...curso,
      isPublished: false,
    });

    await expect(
      criarInscricao(userId, courseId)
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(txMock.enrollment.create).not.toHaveBeenCalled();
  });

  it("não deve permitir inscrição em curso inexistente", async () => {
    txMock.course.findUnique.mockResolvedValue(null);

    await expect(
      criarInscricao(userId, courseId)
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(txMock.enrollment.create).not.toHaveBeenCalled();
  });

  it("não deve permitir uma segunda inscrição pendente", async () => {
    txMock.enrollment.findFirst.mockResolvedValue({
      id: "inscricao-existente",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await expect(
      criarInscricao(userId, courseId)
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(txMock.enrollment.create).not.toHaveBeenCalled();
  });

  it("não deve permitir uma segunda inscrição ativa", async () => {
    txMock.enrollment.findFirst.mockResolvedValue({
      id: "inscricao-existente",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    await expect(
      criarInscricao(userId, courseId)
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(txMock.enrollment.create).not.toHaveBeenCalled();
  });

  it("deve expirar uma inscrição pendente vencida e criar outra", async () => {
    txMock.enrollment.findFirst.mockResolvedValue({
      id: "inscricao-antiga",
      status: "PENDING",
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    await criarInscricao(userId, courseId);

    expect(txMock.enrollment.update).toHaveBeenCalledWith({
      where: { id: "inscricao-antiga" },
      data: { status: "EXPIRED" },
    });

    expect(txMock.enrollment.create).toHaveBeenCalledOnce();
  });
});
