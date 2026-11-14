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
      ).rejects.toThrow("O bloqueio de reconciliação foi perdido.");

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

it("recupera um bloqueio expirado usando o relógio do PostgreSQL", async () => {
  const cursorId = `TEST_REFUND_EXPIRED_${randomUUID()}`;

  try {
    const primeira = await adquirirBloqueioReconciliacao({
      db: prisma,
      cursorId,
      duracaoMs: 1_000,
    });

    expect(primeira.adquirido).toBe(true);

    // Expira o bloqueio diretamente no PostgreSQL,
    // sem alterar o relógio da aplicação.
    await prisma.$executeRaw`
      UPDATE "ReconciliationCursor"
      SET "lockedUntil" = clock_timestamp() - INTERVAL '1 second'
      WHERE "id" = ${cursorId}
        AND "lockedBy" = ${primeira.identificador}
    `;

    const segunda = await adquirirBloqueioReconciliacao({
      db: prisma,
      cursorId,
      duracaoMs: 300_000,
    });

    expect(segunda.adquirido).toBe(true);
    expect(segunda.identificador).not.toBe(primeira.identificador);

    const renovacaoAntiga = await renovarBloqueioReconciliacao({
      db: prisma,
      cursorId,
      identificador: primeira.identificador,
    });

    expect(renovacaoAntiga.renovado).toBe(false);

    await expect(
      atualizarCursorReconciliacao({
        db: prisma,
        cursorId,
        identificador: primeira.identificador,
        ultimoId: "pagamento-antigo",
      }),
    ).rejects.toThrow("O bloqueio de reconciliação foi perdido.");

    const liberacaoAntiga = await liberarBloqueioReconciliacao({
      db: prisma,
      cursorId,
      identificador: primeira.identificador,
    });

    expect(liberacaoAntiga.liberado).toBe(false);

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
