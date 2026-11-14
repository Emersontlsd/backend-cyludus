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
    $queryRaw: vi.fn().mockResolvedValue([
      {
        lockedUntil: new Date("2026-11-10T12:05:00.000Z"),
      },
    ]),
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
  it("adquire um bloqueio disponível usando o relógio do PostgreSQL", async () => {
    const db = criarDbMock();

    const resultado = await adquirirBloqueioReconciliacao({
      db,
    });

    expect(resultado.adquirido).toBe(true);
    expect(resultado.identificador).toEqual(expect.any(String));

    expect(resultado.expiraEm).toEqual(new Date("2026-11-10T12:05:00.000Z"));

    expect(db.reconciliationCursor.createMany).toHaveBeenCalledWith({
      data: [{ id: RECONCILIATION_CURSOR_ID }],
      skipDuplicates: true,
    });

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);

    expect(db.reconciliationCursor.updateMany).not.toHaveBeenCalled();
  });

  it("não adquire um bloqueio ocupado", async () => {
    const db = criarDbMock();

    db.$queryRaw.mockResolvedValue([]);

    const resultado = await adquirirBloqueioReconciliacao({
      db,
    });

    expect(resultado).toEqual({
      adquirido: false,
      identificador: null,
      expiraEm: null,
    });
  });

  it("renova somente um bloqueio válido usando o relógio do PostgreSQL", async () => {
    const db = criarDbMock();

    const resultado = await renovarBloqueioReconciliacao({
      db,
      identificador: "execucao-1",
    });

    expect(resultado.renovado).toBe(true);

    expect(resultado.expiraEm).toEqual(new Date("2026-11-10T12:05:00.000Z"));

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);

    expect(db.reconciliationCursor.updateMany).not.toHaveBeenCalled();
  });

  it("não renova um bloqueio perdido", async () => {
    const db = criarDbMock();

    db.$queryRaw.mockResolvedValue([]);

    const resultado = await renovarBloqueioReconciliacao({
      db,
      identificador: "execucao-antiga",
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

    expect(db.reconciliationCursor.updateMany).toHaveBeenCalledWith({
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

  it("consulta o cursor com bloqueio válido no PostgreSQL", async () => {
    const db = criarDbMock();

    db.$queryRaw.mockResolvedValue([{ lastId: "pagamento-123" }]);

    const ultimoId = await obterCursorReconciliacao({
      db,
      identificador: "execucao-1",
    });

    expect(ultimoId).toBe("pagamento-123");
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.reconciliationCursor.findFirst).not.toHaveBeenCalled();
  });

  it("rejeita leitura sem bloqueio válido", async () => {
    const db = criarDbMock();

    db.$queryRaw.mockResolvedValue([]);

    await expect(
      obterCursorReconciliacao({
        db,
        identificador: "execucao-antiga",
      }),
    ).rejects.toThrow("Bloqueio de reconciliação ausente ou expirado.");
  });

  it("atualiza o cursor com bloqueio válido no PostgreSQL", async () => {
    const db = criarDbMock();

    db.$queryRaw.mockResolvedValue([{ lastId: "pagamento-456" }]);

    const resultado = await atualizarCursorReconciliacao({
      db,
      identificador: "execucao-1",
      ultimoId: "pagamento-456",
    });

    expect(resultado).toEqual({
      atualizado: true,
      ultimoId: "pagamento-456",
    });

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);

    expect(db.reconciliationCursor.updateMany).not.toHaveBeenCalled();
  });

  it("permite reiniciar a varredura com cursor null", async () => {
    const db = criarDbMock();

    db.$queryRaw.mockResolvedValue([{ lastId: null }]);

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

    db.$queryRaw.mockResolvedValue([]);

    await expect(
      atualizarCursorReconciliacao({
        db,
        identificador: "execucao-antiga",
        ultimoId: "pagamento-789",
        agora,
      }),
    ).rejects.toThrow("O bloqueio de reconciliação foi perdido.");
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
    ).rejects.toThrow("O último ID deve ser uma string não vazia ou null.");
  });
});
