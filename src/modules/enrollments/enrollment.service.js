import { prisma } from "../../config/prisma.ts";

const PRAZO_PAGAMENTO_HORAS = 24;

export async function criarInscricao(userId, courseId) {
  try {
    return await prisma.$transaction(async (tx) => {
      const curso = await tx.course.findUnique({
        where: { id: courseId },
        select: {
          id: true,
          title: true,
          price: true,
          isPublished: true,
        },
      });

      if (!curso || !curso.isPublished) {
        const erro = new Error("Curso não encontrado ou não está disponível.");
        erro.statusCode = 404;
        throw erro;
      }

      const agora = new Date();

      const inscricaoExistente = await tx.enrollment.findFirst({
        where: {
          userId,
          courseId,
          status: {
            in: ["PENDING", "ACTIVE"],
          },
        },
      });

      if (inscricaoExistente) {
        const pagamentoExpirado =
          inscricaoExistente.status === "PENDING" &&
          inscricaoExistente.expiresAt <= agora;

        if (pagamentoExpirado) {
          await tx.enrollment.update({
            where: { id: inscricaoExistente.id },
            data: {
              status: "EXPIRED",
            },
          });
        } else {
          const erro = new Error(
            "Você já possui uma inscrição pendente ou ativa neste curso.",
          );
          erro.statusCode = 409;
          throw erro;
        }
      }

      const expiresAt = new Date(
        agora.getTime() + PRAZO_PAGAMENTO_HORAS * 60 * 60 * 1000,
      );

      return await tx.enrollment.create({
        data: {
          userId,
          courseId,
          status: "PENDING",
          priceAtPurchase: curso.price,
          expiresAt,
        },
        select: {
          id: true,
          userId: true,
          courseId: true,
          status: true,
          priceAtPurchase: true,
          expiresAt: true,
          createdAt: true,
        },
      });
    });
  } catch (erro) {
    // o indice unico do PostgreSQL também protege contra duas tentativas simultaneas de inscricao
    if (erro.code === "P2002" || erro.meta?.code === "23505") {
      const conflito = new Error(
        "Você já possui uma inscrição pendente ou ativa neste curso.",
      );
      conflito.statusCode = 409;
      throw conflito;
    }

    throw erro;
  }
}

export async function listarMinhasInscricoes(userId) {
  const agora = new Date();

  // atualiza inscricoes pendentes cujo prazo de pagamento terminou
  await prisma.enrollment.updateMany({
    where: {
      userId,
      status: "PENDING",
      expiresAt: {
        lte: agora,
      },
    },
    data: {
      status: "EXPIRED",
    },
  });

  return prisma.enrollment.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      status: true,
      priceAtPurchase: true,
      expiresAt: true,
      activatedAt: true,
      cancelledAt: true,
      createdAt: true,
      updatedAt: true,

      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          imageUrl: true,
          instructorImageUrl: true,
          badge: true,
        },
      },

      payments: {
        select: {
          id: true,
          provider: true,
          status: true,
          paymentMethod: true,
          installments: true,
          amount: true,
          currency: true,
          approvedAt: true,
          refundedAt: true,
          createdAt: true,
        },
      },
    },
  });
}
