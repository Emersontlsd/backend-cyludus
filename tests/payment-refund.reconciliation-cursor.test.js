
import { describe, expect, it, vi } from "vitest";

import {
  RECONCILIATION_CURSOR_ID,
  adquirirBloqueioReconciliacao,
  renovarBloqueioReconciliacao,
  liberarBloqueioReconciliacao,
  obterCursorReconciliacao,
  atualizarCursorReconciliacao,
} from "../src/modules/payments/payment-refund.reconciliation-cursor.js";

const agora = new Date("2026-11-10T12:00:00.000Z");

function criarDbMock() {
  return {
    reconciliationCursor: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue({
        lastId: "pagamento-123",
      }),
    },
  };
}

describe("Cursor de reconciliação de reembolsos", () => {
  it("adquire um bloqueio disponível", async () => {
    const db = criarDbMock();

    const resultado = await adquirirBloqueioReconciliacao({
      db,
      agora,
    });

    expect(resultado.adquirido).toBe(true);
    expect(resultado.identificador).toEqual(
      expect.any(String),
    );

    expect(db.reconciliationCursor.createMany)
      .toHaveBeenCalledWith({
        data: [{ id: RECONCILIATION_CURSOR_ID }],
        skipDuplicates: true,
      });

    expect(db.reconciliationCursor.updateMany)
      .toHaveBeenCalledWith({
        where: {
          id: RECONCILIATION_CURSOR_ID,
          OR: [
            { lockedUntil: null },
            { lockedUntil: { lte: agora } },
          ],
        },
        data: {
          lockedBy: resultado.identificador,
          lockedUntil: new Date(
            agora.getTime() + 300_000,
          ),
        },
      });
  });

  it("não adquire um bloqueio ocupado", async () => {
    const db = criarDbMock();

    db.reconciliationCursor.updateMany
      .mockResolvedValue({ count: 0 });

    const resultado = await adquirirBloqueioReconciliacao({
      db,
      agora,
    });

    expect(resultado).toEqual({
      adquirido: false,
      identificador: null,
      expiraEm: null,
    });
  });

  it("renova somente um bloqueio válido", async () => {
    const db = criarDbMock();

    const resultado = await renovarBloqueioReconciliacao({
      db,
      identificador: "execucao-1",
      agora,
    });

    expect(resultado.renovado).toBe(true);

    expect(db.reconciliationCursor.updateMany)
      .toHaveBeenCalledWith({
        where: {
          id: RECONCILIATION_CURSOR_ID,
          lockedBy: "execucao-1",
          lockedUntil: { gt: agora },
        },
        data: {
          lockedUntil: new Date(
            agora.getTime() + 300_000,
          ),
        },
      });
  });

  it("não renova um bloqueio perdido", async () => {
    const db = criarDbMock();

    db.reconciliationCursor.updateMany
      .mockResolvedValue({ count: 0 });

    const resultado = await renovarBloqueioReconciliacao({
      db,
      identificador: "execucao-antiga",
      agora,
    });

    expect(resultado.renovado).toBe(false);
    expect(resultado.expiraEm).toBeNull();
  });

  it("libera o bloqueio usando o identificador", async () => {
    const db = criarDbMock();

    const resultado = await liberarBloqueioReconciliacao({
      db,
      identificador: "execucao-1",
    });

    expect(resultado.liberado).toBe(true);

    expect(db.reconciliationCursor.updateMany)
      .toHaveBeenCalledWith({
        where: {
          id: RECONCILIATION_CURSOR_ID,
          lockedBy: "execucao-1",
        },
        data: {
          lockedBy: null,
          lockedUntil: null,
        },
      });
  });

  it("consulta o cursor com bloqueio válido", async () => {
    const db = criarDbMock();

    const ultimoId = await obterCursorReconciliacao({
      db,
      identificador: "execucao-1",
      agora,
    });

    expect(ultimoId).toBe("pagamento-123");

    expect(db.reconciliationCursor.findFirst)
      .toHaveBeenCalledWith({
        where: {
          id: RECONCILIATION_CURSOR_ID,
          lockedBy: "execucao-1",
          lockedUntil: { gt: agora },
        },
        select: {
          lastId: true,
        },
      });
  });

  it("rejeita leitura sem bloqueio válido", async () => {
    const db = criarDbMock();

    db.reconciliationCursor.findFirst
      .mockResolvedValue(null);

    await expect(
      obterCursorReconciliacao({
        db,
        identificador: "execucao-antiga",
        agora,
      }),
    ).rejects.toThrow(
      "Bloqueio de reconciliação ausente ou expirado.",
    );
  });

  it("atualiza o cursor com bloqueio válido", async () => {
    const db = criarDbMock();

    const resultado = await atualizarCursorReconciliacao({
      db,
      identificador: "execucao-1",
      ultimoId: "pagamento-456",
      agora,
    });

    expect(resultado).toEqual({
      atualizado: true,
      ultimoId: "pagamento-456",
    });

    expect(db.reconciliationCursor.updateMany)
      .toHaveBeenCalledWith({
        where: {
          id: RECONCILIATION_CURSOR_ID,
          lockedBy: "execucao-1",
          lockedUntil: { gt: agora },
        },
        data: {
          lastId: "pagamento-456",
        },
      });
  });

  it("permite reiniciar a varredura com cursor null", async () => {
    const db = criarDbMock();

    const resultado = await atualizarCursorReconciliacao({
      db,
      identificador: "execucao-1",
      ultimoId: null,
      agora,
    });

    expect(resultado.ultimoId).toBeNull();
  });

  it("impede atualização após perder o bloqueio", async () => {
    const db = criarDbMock();

    db.reconciliationCursor.updateMany
      .mockResolvedValue({ count: 0 });

    await expect(
      atualizarCursorReconciliacao({
        db,
        identificador: "execucao-antiga",
        ultimoId: "pagamento-789",
        agora,
      }),
    ).rejects.toThrow(
      "Não foi possível atualizar o cursor: bloqueio ausente ou expirado.",
    );
  });

  it("rejeita identificador de pagamento inválido", async () => {
    const db = criarDbMock();

    await expect(
      atualizarCursorReconciliacao({
        db,
        identificador: "execucao-1",
        ultimoId: "",
        agora,
      }),
    ).rejects.toThrow(
      "O último ID deve ser uma string não vazia ou null.",
    );
  });
});
