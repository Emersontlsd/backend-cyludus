import { prisma } from "../../config/prisma.ts";

export async function registrarOcorrenciaFinanceira({
  paymentId,
  type,
  reason,
  providerPaymentId = null,
  db = prisma,
}) {
  if (
    typeof paymentId !== "string" ||
    !paymentId.trim() ||
    typeof type !== "string" ||
    !type.trim() ||
    typeof reason !== "string" ||
    !reason.trim()
  ) {
    const erro = new Error("Os dados da ocorrência financeira são inválidos.");
    erro.statusCode = 400;
    throw erro;
  }

  const dados = {
    paymentId: paymentId.trim(),
    type: type.trim(),
    reason: reason.trim(),
    providerPaymentId:
      providerPaymentId == null ? null : String(providerPaymentId).trim(),
  };

  // Verifica se já existe uma ocorrência aberta.
  const existente = await db.paymentIncident.findFirst({
    where: {
      paymentId: dados.paymentId,
      type: dados.type,
      status: "OPEN",
    },
  });

  if (existente) {
    return {
      incident: existente,
      alreadyExists: true,
    };
  }

  // Tenta criar a ocorrência financeira.
  try {
    const incident = await db.paymentIncident.create({
      data: {
        ...dados,
        status: "OPEN",
      },
    });

    return {
      incident,
      alreadyExists: false,
    };
  } catch (erro) {
    if (erro.code !== "P2002" || db !== prisma) {
      // Dentro de uma transação, o conflito deve provocar rollback.
      // A reconciliação será realizada fora dela.
      throw erro;
    }

    // Outra requisição pode ter criado a ocorrência.
    const existente = await db.paymentIncident.findFirst({
      where: {
        paymentId: dados.paymentId,
        type: dados.type,
        status: "OPEN",
      },
    });

    if (!existente) {
      throw erro;
    }

    return {
      incident: existente,
      alreadyExists: true,
    };
  }
}


export async function buscarOcorrenciaFinanceira({
  paymentId,
  providerPaymentId,
  types,
  db = prisma,
}) {
  if (
    typeof paymentId !== "string" ||
    !paymentId.trim() ||
    typeof providerPaymentId !== "string" ||
    !providerPaymentId.trim() ||
    !Array.isArray(types) ||
    types.length === 0 ||
    !types.every(
      (type) => typeof type === "string" && type.trim(),
    )
  ) {
    const erro = new Error(
      "Os dados para consulta da ocorrência financeira são inválidos.",
    );

    erro.statusCode = 400;
    throw erro;
  }

  return db.paymentIncident.findFirst({
    where: {
      paymentId: paymentId.trim(),
      providerPaymentId: providerPaymentId.trim(),
      type: {
        in: types,
      },
      status: "OPEN",
    },
  });
}
