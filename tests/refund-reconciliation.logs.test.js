import { describe, expect, it } from "vitest";

import {
  extrairRegistrosReconciliacao,
  analisarLogsReconciliacao,
  analisarArquivoLogsReconciliacao,
} from "../src/modules/monitoring/refund-reconciliation.logs.js";

import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ID = "550e8400-e29b-41d4-a716-446655440000";

const evento = {
  executionId: ID,
  event: "REFUND_RECONCILIATION_COMPLETED",
  status: "SUCCESS",
  exitCode: 0,
};

const alerta = {
  source: "refund-reconciliation",
  executionId: ID,
  event: "REFUND_RECONCILIATION_COMPLETED",
  severity: "INFO",
  requiresAttention: false,
};

function gerarConteudo(...linhas) {
  return linhas
    .map((linha) => (typeof linha === "string" ? linha : JSON.stringify(linha)))
    .join("\n");
}

describe("Leitura operacional dos logs de reconciliação", () => {
  it("extrai evento e alerta JSON", () => {
    const resultado = extrairRegistrosReconciliacao(
      gerarConteudo(evento, alerta),
    );

    expect(resultado.registros).toHaveLength(2);
    expect(resultado.linhasInvalidas).toBe(0);
  });

  it("ignora mensagens comuns do executor", () => {
    const resultado = extrairRegistrosReconciliacao(
      gerarConteudo("Iniciando reconciliação de reembolsos...", evento, alerta),
    );

    expect(resultado.registros).toHaveLength(2);
    expect(resultado.linhasInvalidas).toBe(0);
    expect(resultado.linhasIgnoradas).toBe(1);
  });

  it("ignora JSON não relacionado", () => {
    const resultado = extrairRegistrosReconciliacao(
      gerarConteudo({ event: "OUTRO_EVENTO" }, evento, alerta),
    );

    expect(resultado.registros).toHaveLength(2);
    expect(resultado.linhasIgnoradas).toBe(1);
  });

  it("contabiliza JSON inválido", () => {
    const resultado = extrairRegistrosReconciliacao(
      gerarConteudo("{json inválido", evento),
    );

    expect(resultado.linhasInvalidas).toBe(1);
    expect(resultado.registros).toHaveLength(1);
  });

  it("ignora linhas vazias", () => {
    const resultado = extrairRegistrosReconciliacao(
      "\n\n" + gerarConteudo(evento, alerta) + "\n",
    );

    expect(resultado.registros).toHaveLength(2);
    expect(resultado.linhasInvalidas).toBe(0);
  });

  it("analisa logs íntegros", () => {
    const resultado = analisarLogsReconciliacao(gerarConteudo(evento, alerta));

    expect(resultado.integro).toBe(true);
    expect(resultado.totalEventos).toBe(1);
    expect(resultado.totalAlertas).toBe(1);
  });

  it("detecta evento sem alerta", () => {
    const resultado = analisarLogsReconciliacao(gerarConteudo(evento));

    expect(resultado.integro).toBe(false);
    expect(
      resultado.problemas.some((problema) => problema.tipo === "MISSING_ALERT"),
    ).toBe(true);
  });

  it("detecta alerta órfão", () => {
    const resultado = analisarLogsReconciliacao(gerarConteudo(alerta));

    expect(
      resultado.problemas.some((problema) => problema.tipo === "ORPHAN_ALERT"),
    ).toBe(true);
  });

  it("detecta evento duplicado", () => {
    const resultado = analisarLogsReconciliacao(
      gerarConteudo(evento, evento, alerta),
    );

    expect(
      resultado.problemas.some(
        (problema) => problema.tipo === "DUPLICATE_EVENT",
      ),
    ).toBe(true);
  });

  it("aceita registros antigos sem executionId", () => {
    const { executionId: idEvento, ...eventoLegado } = evento;
    const { executionId: idAlerta, ...alertaLegado } = alerta;

    const resultado = analisarLogsReconciliacao(
      gerarConteudo(eventoLegado, alertaLegado),
    );

    expect(resultado.integro).toBe(true);
    expect(resultado.registrosLegados).toBe(2);
  });

  it("rejeita conteúdo que não seja string", () => {
    expect(() => extrairRegistrosReconciliacao(null)).toThrow(TypeError);
  });

  it("rejeita caminho vazio", async () => {
    await expect(analisarArquivoLogsReconciliacao("")).rejects.toThrow(
      TypeError,
    );
  });

  it("lê um arquivo real sem modificar seu conteúdo", async () => {
    const diretorio = await mkdtemp(join(tmpdir(), "cyludus-logs-"));

    const caminho = join(diretorio, "reconciliacao.jsonl");
    const conteudo = gerarConteudo(evento, alerta);

    try {
      await writeFile(caminho, conteudo, "utf8");

      const resultado = await analisarArquivoLogsReconciliacao(caminho);

      expect(resultado.integro).toBe(true);
      expect(resultado.totalRegistros).toBe(2);
    } finally {
      await rm(diretorio, {
        recursive: true,
        force: true,
      });
    }
  });
});
