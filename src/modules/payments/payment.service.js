import { prisma } from "../../config/prisma.ts";
import { randomUUID } from "node:crypto";

export async function validarInscricaoParaPagamento(userId, enrollmentId) {
  const inscricao = await prisma.enrollment.findUnique({
    where: {
      id: enrollmentId,
    },
    select: {
      id: true,
      userId: true,
      status: true,
      priceAtPurchase: true,
      expiresAt: true,

      user: {
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
        },
      },

      course: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  if (!inscricao) {
    const erro = new Error("Inscrição não encontrada.");
    erro.statusCode = 404;
    throw erro;
  }

  if (inscricao.userId !== userId) {
    const erro = new Error("Você não tem permissão para pagar essa inscrição.");
    erro.statusCode = 403;
    throw erro;
  }

  if (!inscricao.user.isActive) {
    const erro = new Error("Sua conta está inativa.");
    erro.statusCode = 403;
    throw erro;
  }

  if (inscricao.status !== "PENDING") {
    const erro = new Error("Está inscrição não está aguardando pagamento.");
    erro.statusCode = 409;
    throw erro;
  }

  const agora = new Date();

  if (inscricao.expiresAt <= agora) {
    await prisma.enrollment.update({
      where: {
        id: inscricao.id,
      },
      data: {
        status: "EXPIRED",
      },
    });

    const erro = new Error("O prazo de pagamento desta inscrição expirou.");
    erro.statusCode = 409;
    throw erro;
  }

  if (!inscricao.user.email) {
    const erro = new Error(
      "Não foi possível identificar o e-mail da sua conta.",
    );
    erro.statusCode = 400;
    throw erro;
  }

  return {
    id: inscricao.id,
    userId: inscricao.userId,
    priceAtPurchase: inscricao.priceAtPurchase,
    expiresAt: inscricao.expiresAt,

    user: {
      name: inscricao.user.name,
      email: inscricao.user.email,
    },

    course: {
      id: inscricao.course.id,
      title: inscricao.course.title,
    },
  };
}

export async function obterOuCriarPagamento(inscricao) {
  try {
    return await prisma.$transaction(async (tx) => {
    const pagamentoExistente = await tx.payment.findFirst({
      where: {
        enrollmentId: inscricao.id,
        status: {
          in: ["INITIATING", "PENDING"],
        },
      },
    });

    if (pagamentoExistente) {
      return pagamentoExistente;
    }

    return tx.payment.create({
      data: {
        enrollmentId: inscricao.id,
        provider: "MERCADO_PAGO",
        status: "INITIATING",
        idempotencyKey: randomUUID(),
        amount: inscricao.priceAtPurchase,
        currency: "BRL",
        installments: 1,
      },
    });
  });
  } catch (erro) {
    if (erro.code === "P2002" || erro.meta?.code === "23505") {
      const pagamentoExistente = await prisma.payment.findFirst({
        where: {
          enrollmentId: inscricao.id,
          status: {
            in: ["INITIATING", "PENDING"],
          },
        },
      });

      if (pagamentoExistente) {
        return pagamentoExistente;
      }
    }

    throw erro;
  }
}
