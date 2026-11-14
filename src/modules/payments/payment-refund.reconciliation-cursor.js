import { randomUUID } from "node:crypto";

import { prisma } from "../../config/prisma.ts";

export const RECONCILIATION_CURSOR_ID = "MERCADO_PAGO_REFUNDS";

export async function adquirirBloqueioReconciliacao({
  db = prisma,
  duracaoMs = 300_000,
  cursorId = RECONCILIATION_CURSOR_ID,
} = {}) {
  if (!Number.isInteger(duracaoMs) || duracaoMs < 1_000) {
    throw new Error("A duração do bloqueio deve ser de pelo menos 1000 ms.");
  }

  const identificador = randomUUID();

  await db.reconciliationCursor.createMany({
    data: [{ id: cursorId }],
    skipDuplicates: true,
  });

  const registros = await db.$queryRaw`
    UPDATE "ReconciliationCursor"
    SET
      "lockedBy" = ${identificador},
      "lockedUntil" = clock_timestamp()
        + (${duracaoMs}::double precision * INTERVAL '1 millisecond')
    WHERE
      "id" = ${cursorId}
      AND (
        "lockedUntil" IS NULL
        OR "lockedUntil" <= clock_timestamp()
      )
    RETURNING "lockedUntil"
  `;

  if (registros.length === 0) {
    return {
      adquirido: false,
      identificador: null,
      expiraEm: null,
    };
  }

  return {
    adquirido: true,
    identificador,
    expiraEm: registros[0].lockedUntil,
  };
}

export async function renovarBloqueioReconciliacao({
  db = prisma,
  identificador,
  duracaoMs = 300_000,
  cursorId = RECONCILIATION_CURSOR_ID,
} = {}) {
  if (!identificador) {
    throw new Error("Identificador do bloqueio não informado.");
  }

  if (!Number.isInteger(duracaoMs) || duracaoMs < 1_000) {
    throw new Error("A duração do bloqueio deve ser de pelo menos 1000 ms.");
  }

  const registros = await db.$queryRaw`
    UPDATE "ReconciliationCursor"
    SET
      "lockedUntil" = clock_timestamp()
        + (${duracaoMs}::double precision * INTERVAL '1 millisecond')
    WHERE
      "id" = ${cursorId}
      AND "lockedBy" = ${identificador}
      AND "lockedUntil" > clock_timestamp()
    RETURNING "lockedUntil"
  `;

  if (registros.length === 0) {
    return {
      renovado: false,
      expiraEm: null,
    };
  }

  return {
    renovado: true,
    expiraEm: registros[0].lockedUntil,
  };
}

export async function liberarBloqueioReconciliacao({
  db = prisma,
  identificador,
  cursorId = RECONCILIATION_CURSOR_ID,
} = {}) {
  if (!identificador) {
    throw new Error("Identificador do bloqueio não informado.");
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
  cursorId = RECONCILIATION_CURSOR_ID,
} = {}) {
  if (!identificador) {
    throw new Error("Identificador do bloqueio não informado.");
  }

  const registros = await db.$queryRaw`
    SELECT "lastId"
    FROM "ReconciliationCursor"
    WHERE "id" = ${cursorId}
      AND "lockedBy" = ${identificador}
      AND "lockedUntil" > clock_timestamp()
  `;

  if (registros.length === 0) {
    throw new Error("Bloqueio de reconciliação ausente ou expirado.");
  }

  return registros[0].lastId;
}

export async function atualizarCursorReconciliacao({
  db = prisma,
  identificador,
  ultimoId,
  cursorId = RECONCILIATION_CURSOR_ID,
} = {}) {
  if (!identificador) {
    throw new Error("Identificador do bloqueio não informado.");
  }

  if (ultimoId !== null && (typeof ultimoId !== "string" || !ultimoId.trim())) {
    throw new Error("O último ID deve ser uma string não vazia ou null.");
  }

  const registros = await db.$queryRaw`
    UPDATE "ReconciliationCursor"
    SET "lastId" = ${ultimoId}
    WHERE "id" = ${cursorId}
      AND "lockedBy" = ${identificador}
      AND "lockedUntil" > clock_timestamp()
    RETURNING "lastId"
  `;

  if (registros.length !== 1) {
    throw new Error("O bloqueio de reconciliação foi perdido.");
  }

  return {
    atualizado: true,
    ultimoId: registros[0].lastId,
  };
}
