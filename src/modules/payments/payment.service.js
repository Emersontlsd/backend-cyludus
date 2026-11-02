import { prisma } from "../../config/prisma.ts";
import { Prisma } from "../../generated/prisma/client.ts";
import { randomUUID } from "node:crypto";

import { construirOrderRequest } from "./payment-order.builder.js";
import { criarOrderMercadoPago } from "./mercadopago-order.service.js";

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

export async function criarCheckoutPagamento(userId, enrollmentId) {
  // valida a inscrição e recupera os dados do comprador e do curso
  const inscricao = await validarInscricaoParaPagamento(
    userId,
    enrollmentId,
  );

  // recupera ou cria o pagamento local
  const pagamento = await obterOuCriarPagamento(inscricao);

  // se o checkout ja existe, devolve a mesma url
  if (pagamento.status === "PENDING" && pagamento.checkoutUrl) {
    return pagamento;
  }

  // reutiliza o corpo salvo ou constroi um novo
  let orderRequest = pagamento.orderRequest;

  if (!orderRequest) {
    orderRequest = construirOrderRequest({
      pagamento,
      inscricao,
    });

    // Salva o corpo somente se ainda estiver vazio.
    // Isso impede que requisições simultâneas sobrescrevam a ordem.
    await prisma.payment.updateMany({
      where: {
        id: pagamento.id,
        orderRequest: Prisma.DbNull,
      },
      data: {
        orderRequest,
      },
    });

    // recupera o corpo efetivamente salvo no banco
    const pagamentoAtualizado = await prisma.payment.findUnique({
      where: {
        id: pagamento.id,
      },
      select: {
        orderRequest: true,
      },
    });

    if (!pagamentoAtualizado?.orderRequest) {
      const erro = new Error(
        "Não foi possível recuperar os dados da ordem de pagamento.",
      );

      erro.statusCode = 500;
      throw erro;
    }

    orderRequest = pagamentoAtualizado.orderRequest;
  }

  // cria ou recupera a ordem usando a mesma chave de idempotência
  const resposta = await criarOrderMercadoPago({
    body: orderRequest,
    idempotencyKey: pagamento.idempotencyKey,
  });

  // so aceita uma resposta que contenha os dados necessarios
  if (
    !resposta ||
    typeof resposta.id !== "string" ||
    !resposta.id ||
    typeof resposta.checkout_url !== "string" ||
    !resposta.checkout_url
  ) {
    const erro = new Error(
      "O Mercado Pago não retornou os dados necessários para o checkout.",
    );

    erro.statusCode = 502;
    throw erro;
  }

  // persiste a ordem e libera o URL para o frontend
  return prisma.payment.update({
    where: {
      id: pagamento.id,
    },
    data: {
      providerOrderId: resposta.id,
      checkoutUrl: resposta.checkout_url,
      status: "PENDING",
    },
  });
}
