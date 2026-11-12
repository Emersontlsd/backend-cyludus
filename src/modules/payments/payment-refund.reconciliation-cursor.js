
import { randomUUID } from "node:crypto";

import { prisma } from "../../config/prisma.ts";

export const RECONCILIATION_CURSOR_ID = "MERCADO_PAGO_REFUNDS";

export async function adquirirBloqueioReconciliacao({
  db = prisma,
  duracaoMs = 300_000,
  agora = new Date(),
  cursorId = RECONCILIATION_CURSOR_ID,
} = {}) {
  if (
    !Number.isInteger(duracaoMs) ||
    duracaoMs < 1_000
  ) {
    throw new Error(
      "A duração do bloqueio deve ser de pelo menos 1000 ms.",
    );
  }

  const identificador = randomUUID();

  const expiracao = new Date(
    agora.getTime() + duracaoMs,
  );

  // Garante a existência do registro sem sobrescrever
  // um bloqueio já adquirido por outra execução.
  await db.reconciliationCursor.createMany({
    data: [
      {
        id: cursorId,
      },
    ],
    skipDuplicates: true,
  });

  // Atualização condicional executada atomicamente
  // pelo PostgreSQL.
  const resultado = await db.reconciliationCursor.updateMany({
    where: {
      id: cursorId,
      OR: [
        {
          lockedUntil: null,
        },
        {
          lockedUntil: {
            lte: agora,
          },
        },
      ],
    },
    data: {
      lockedBy: identificador,
      lockedUntil: expiracao,
    },
  });

  if (resultado.count !== 1) {
    return {
      adquirido: false,
      identificador: null,
      expiraEm: null,
    };
  }

  return {
    adquirido: true,
    identificador,
    expiraEm: expiracao,
  };
}


export async function renovarBloqueioReconciliacao({
  db = prisma,
  identificador,
  duracaoMs = 300_000,
  agora = new Date(),
  cursorId = RECONCILIATION_CURSOR_ID,
} = {}) {
  if (!identificador) {
    throw new Error(
      "Identificador do bloqueio não informado.",
    );
  }

  if (!Number.isInteger(duracaoMs) || duracaoMs < 1_000) {
    throw new Error(
      "A duração do bloqueio deve ser de pelo menos 1000 ms.",
    );
  }

  const novaExpiracao = new Date(
    agora.getTime() + duracaoMs,
  );

  const resultado = await db.reconciliationCursor.updateMany({
    where: {
      id: cursorId,
      lockedBy: identificador,
      lockedUntil: {
        gt: agora,
      },
    },
    data: {
      lockedUntil: novaExpiracao,
    },
  });

  return {
    renovado: resultado.count === 1,
    expiraEm: resultado.count === 1
      ? novaExpiracao
      : null,
  };
}

export async function liberarBloqueioReconciliacao({
  db = prisma,
  identificador,
  cursorId = RECONCILIATION_CURSOR_ID,
} = {}) {
  if (!identificador) {
    throw new Error(
      "Identificador do bloqueio não informado.",
    );
  }

  const resultado = await db.reconciliationCursor.updateMany({
    where: {
      id: cursorId,
      lockedBy: identificador,
    },
    data: {
      lockedBy: null,
      lockedUntil: null,
    },
  });

  return {
    liberado: resultado.count === 1,
  };
}


export async function obterCursorReconciliacao({
  db = prisma,
  identificador,
  agora = new Date(),
  cursorId = RECONCILIATION_CURSOR_ID,
} = {}) {
  if (!identificador) {
    throw new Error(
      "Identificador do bloqueio não informado.",
    );
  }

  const cursor = await db.reconciliationCursor.findFirst({
    where: {
      id: cursorId,
      lockedBy: identificador,
      lockedUntil: {
        gt: agora,
      },
    },
    select: {
      lastId: true,
    },
  });

  if (!cursor) {
    throw new Error(
      "Bloqueio de reconciliação ausente ou expirado.",
    );
  }

  return cursor.lastId;
}

export async function atualizarCursorReconciliacao({
  db = prisma,
  identificador,
  ultimoId,
  agora = new Date(),
  cursorId = RECONCILIATION_CURSOR_ID,
} = {}) {
  if (!identificador) {
    throw new Error(
      "Identificador do bloqueio não informado.",
    );
  }

  if (
    ultimoId !== null &&
    (typeof ultimoId !== "string" || !ultimoId.trim())
  ) {
    throw new Error(
      "O último ID deve ser uma string não vazia ou null.",
    );
  }

  const resultado = await db.reconciliationCursor.updateMany({
    where: {
      id: cursorId,
      lockedBy: identificador,
      lockedUntil: {
        gt: agora,
      },
    },
    data: {
      lastId: ultimoId,
    },
  });

  if (resultado.count !== 1) {
    throw new Error(
      "Não foi possível atualizar o cursor: bloqueio ausente ou expirado.",
    );
  }

  return {
    atualizado: true,
    ultimoId,
  };
}