import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { prisma } from "../../src/config/prisma.ts";

import {
  adquirirBloqueioReconciliacao,
  renovarBloqueioReconciliacao,
  liberarBloqueioReconciliacao,
  obterCursorReconciliacao,
  atualizarCursorReconciliacao,
} from "../../src/modules/payments/payment-refund.reconciliation-cursor.js";

describe("Integração do cursor de reconciliação com PostgreSQL", () => {
  it("garante exclusividade e protege o cursor contra outra execução", async () => {
    const cursorId = `TEST_REFUND_${randomUUID()}`;

    try {
      const [primeira, segunda] = await Promise.all([
        adquirirBloqueioReconciliacao({
          db: prisma,
          cursorId,
        }),
        adquirirBloqueioReconciliacao({
          db: prisma,
          cursorId,
        }),
      ]);

      const vencedores = [primeira, segunda].filter(
        (resultado) => resultado.adquirido,
      );

      const perdedores = [primeira, segunda].filter(
        (resultado) => !resultado.adquirido,
      );

      expect(vencedores).toHaveLength(1);
      expect(perdedores).toHaveLength(1);

      const identificador = vencedores[0].identificador;
      const identificadorInvalido = randomUUID();

      const renovacaoInvalida = await renovarBloqueioReconciliacao({
        db: prisma,
        cursorId,
        identificador: identificadorInvalido,
      });

      expect(renovacaoInvalida.renovado).toBe(false);

      const liberacaoInvalida = await liberarBloqueioReconciliacao({
        db: prisma,
        cursorId,
        identificador: identificadorInvalido,
      });

      expect(liberacaoInvalida.liberado).toBe(false);

      await expect(
        atualizarCursorReconciliacao({
          db: prisma,
          cursorId,
          identificador: identificadorInvalido,
          ultimoId: "pagamento-invalido",
        }),
      ).rejects.toThrow("Não foi possível atualizar o cursor");

      const renovacaoValida = await renovarBloqueioReconciliacao({
        db: prisma,
        cursorId,
        identificador,
      });

      expect(renovacaoValida.renovado).toBe(true);

      const atualizacaoValida = await atualizarCursorReconciliacao({
        db: prisma,
        cursorId,
        identificador,
        ultimoId: "pagamento-123",
      });

      expect(atualizacaoValida.atualizado).toBe(true);

      const ultimoId = await obterCursorReconciliacao({
        db: prisma,
        cursorId,
        identificador,
      });

      expect(ultimoId).toBe("pagamento-123");

      const liberacaoValida = await liberarBloqueioReconciliacao({
        db: prisma,
        cursorId,
        identificador,
      });

      expect(liberacaoValida.liberado).toBe(true);

      const novaAquisicao = await adquirirBloqueioReconciliacao({
        db: prisma,
        cursorId,
      });

      expect(novaAquisicao.adquirido).toBe(true);

      // O proprietário anterior não pode liberar o novo bloqueio.
      const liberacaoAntiga = await liberarBloqueioReconciliacao({
        db: prisma,
        cursorId,
        identificador,
      });

      expect(liberacaoAntiga.liberado).toBe(false);

      const registro = await prisma.reconciliationCursor.findUnique({
        where: { id: cursorId },
      });

      expect(registro.lockedBy).toBe(novaAquisicao.identificador);
    } finally {
      await prisma.reconciliationCursor.deleteMany({
        where: {
          id: cursorId,
        },
      });
    }
  });

  it("recupera um bloqueio expirado sem permitir alterações do proprietário antigo", async () => {
    const cursorId = `TEST_REFUND_EXPIRED_${randomUUID()}`;

    const inicio = new Date();
    const depoisDaExpiracao = new Date(inicio.getTime() + 2_000);

    try {
      const primeira = await adquirirBloqueioReconciliacao({
        db: prisma,
        cursorId,
        duracaoMs: 1_000,
        agora: inicio,
      });

      expect(primeira.adquirido).toBe(true);

      // Simula a passagem do tempo sem aguardar realmente.
      const segunda = await adquirirBloqueioReconciliacao({
        db: prisma,
        cursorId,
        duracaoMs: 300_000,
        agora: depoisDaExpiracao,
      });

      expect(segunda.adquirido).toBe(true);
      expect(segunda.identificador).not.toBe(primeira.identificador);

      // A execução antiga não pode renovar o bloqueio.
      const renovacaoAntiga = await renovarBloqueioReconciliacao({
        db: prisma,
        cursorId,
        identificador: primeira.identificador,
        agora: depoisDaExpiracao,
      });

      expect(renovacaoAntiga.renovado).toBe(false);

      // A execução antiga não pode atualizar o cursor.
      await expect(
        atualizarCursorReconciliacao({
          db: prisma,
          cursorId,
          identificador: primeira.identificador,
          ultimoId: "pagamento-antigo",
          agora: depoisDaExpiracao,
        }),
      ).rejects.toThrow("Não foi possível atualizar o cursor");

      // A execução antiga não pode liberar o novo bloqueio.
      const liberacaoAntiga = await liberarBloqueioReconciliacao({
        db: prisma,
        cursorId,
        identificador: primeira.identificador,
      });

      expect(liberacaoAntiga.liberado).toBe(false);

      // O novo proprietário continua com a posse.
      const registro = await prisma.reconciliationCursor.findUnique({
        where: { id: cursorId },
      });

      expect(registro.lockedBy).toBe(segunda.identificador);

      const liberacaoNova = await liberarBloqueioReconciliacao({
        db: prisma,
        cursorId,
        identificador: segunda.identificador,
      });

      expect(liberacaoNova.liberado).toBe(true);
    } finally {
      await prisma.reconciliationCursor.deleteMany({
        where: { id: cursorId },
      });
    }
  });
});
