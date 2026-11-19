
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import {
  analisarArquivoLogsReconciliacao,
} from "../src/modules/monitoring/refund-reconciliation.logs.js";

export async function executarAnaliseLogs({
  caminho,
  analisar = analisarArquivoLogsReconciliacao,
  registrarInfo = console.log,
  registrarErro = console.error,
} = {}) {
  if (typeof caminho !== "string" || !caminho.trim()) {
    registrarErro("Informe o caminho do arquivo de logs JSONL.");
    return 2;
  }

  try {
    const resultado = await analisar(caminho);

    const relatorio = {
      event: "REFUND_RECONCILIATION_LOG_ANALYSIS",
      timestamp: new Date().toISOString(),
      ...resultado,
    };

    registrarInfo(JSON.stringify(relatorio, null, 2));

    // Linhas não interpretáveis impedem uma conclusão
    // confiável sobre a integridade do arquivo.
    if (resultado.linhasInvalidas > 0) {
      return 1;
    }

    return resultado.integro ? 0 : 1;
  } catch (erro) {
    registrarErro(
      `Falha ao analisar logs: ${erro.message}`,
    );
    return 2;
  }
}

const executadoDiretamente =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (executadoDiretamente) {
  process.exitCode = await executarAnaliseLogs({
    caminho: process.argv[2],
  });
}
