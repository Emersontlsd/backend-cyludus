
import { describe, expect, it, vi } from "vitest";

import {
  executarAnaliseLogs,
} from "../scripts/analyze-refund-logs.js";

function criarDependencias(resultado) {
  return {
    caminho: "logs/reconciliacao.jsonl",
    analisar: vi.fn().mockResolvedValue(resultado),
    registrarInfo: vi.fn(),
    registrarErro: vi.fn(),
  };
}

function resultadoIntegro() {
  return {
    integro: true,
    totalRegistros: 2,
    totalEventos: 1,
    totalAlertas: 1,
    registrosLegados: 0,
    problemas: [],
    linhasIgnoradas: 0,
    linhasInvalidas: 0,
  };
}

describe("Comando de análise de logs da reconciliação", () => {
  it("retorna 0 para registros íntegros", async () => {
    const dependencias = criarDependencias(resultadoIntegro());

    const codigo = await executarAnaliseLogs(dependencias);

    expect(codigo).toBe(0);
    expect(dependencias.analisar).toHaveBeenCalledWith(
      "logs/reconciliacao.jsonl",
    );

    const relatorio = JSON.parse(
      dependencias.registrarInfo.mock.calls[0][0],
    );

    expect(relatorio.event).toBe(
      "REFUND_RECONCILIATION_LOG_ANALYSIS",
    );
    expect(relatorio.integro).toBe(true);
    expect(relatorio.timestamp).toBeDefined();
  });

  it("retorna 1 quando existem inconsistências", async () => {
    const dependencias = criarDependencias({
      ...resultadoIntegro(),
      integro: false,
      problemas: [
        {
          tipo: "MISSING_ALERT",
          executionId: "550e8400-e29b-41d4-a716-446655440000",
          detalhe: null,
        },
      ],
    });

    expect(await executarAnaliseLogs(dependencias)).toBe(1);
  });

  it("retorna 1 quando existem linhas inválidas", async () => {
    const dependencias = criarDependencias({
      ...resultadoIntegro(),
      linhasInvalidas: 2,
    });

    expect(await executarAnaliseLogs(dependencias)).toBe(1);
  });

  it("retorna 2 quando o caminho não é informado", async () => {
    const dependencias = criarDependencias(resultadoIntegro());
    dependencias.caminho = "";

    expect(await executarAnaliseLogs(dependencias)).toBe(2);
    expect(dependencias.analisar).not.toHaveBeenCalled();
    expect(dependencias.registrarErro).toHaveBeenCalledOnce();
  });

  it("retorna 2 quando ocorre erro de leitura", async () => {
    const dependencias = criarDependencias(resultadoIntegro());

    dependencias.analisar.mockRejectedValue(
      new Error("Arquivo não encontrado"),
    );

    expect(await executarAnaliseLogs(dependencias)).toBe(2);
    expect(dependencias.registrarErro).toHaveBeenCalledOnce();
  });

  it("não executa operações financeiras", async () => {
    const dependencias = criarDependencias(resultadoIntegro());

    await executarAnaliseLogs(dependencias);

    expect(dependencias.analisar).toHaveBeenCalledOnce();
    expect(dependencias.registrarErro).not.toHaveBeenCalled();
  });
});
