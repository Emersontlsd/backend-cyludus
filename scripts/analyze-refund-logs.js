
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import {
  analisarArquivoLogsReconciliacao,
  analisarLogsComManifestoReconciliacao,
} from "../src/modules/monitoring/refund-reconciliation.logs.js";

async function analisarArquivoComManifesto(caminho, caminhoManifesto) {
  const [conteudo, textoManifesto] = await Promise.all([
    readFile(caminho, "utf8"),
    readFile(caminhoManifesto, "utf8"),
  ]);

  const manifesto = JSON.parse(textoManifesto);

  return analisarLogsComManifestoReconciliacao(
    conteudo,
    manifesto,
  );
}

export async function executarAnaliseLogs({
  caminho,
  caminhoManifesto,
  analisar = analisarArquivoLogsReconciliacao,
  analisarComManifesto = analisarArquivoComManifesto,
  registrarInfo = console.log,
  registrarErro = console.error,
} = {}) {
  if (typeof caminho !== "string" || !caminho.trim()) {
    registrarErro("Informe o caminho do arquivo de logs JSONL.");
    return 2;
  }

  if (
    caminhoManifesto !== undefined &&
    (
      typeof caminhoManifesto !== "string" ||
      !caminhoManifesto.trim()
    )
  ) {
    registrarErro("Informe um caminho válido para o manifesto.");
    return 2;
  }

  try {
    const resultado = caminhoManifesto === undefined
      ? await analisar(caminho)
      : await analisarComManifesto(caminho, caminhoManifesto);

    const relatorio = {
      event: "REFUND_RECONCILIATION_LOG_ANALYSIS",
      timestamp: new Date().toISOString(),
      ...resultado,
    };

    registrarInfo(JSON.stringify(relatorio, null, 2));

    if (resultado.linhasInvalidas > 0) {
      return 1;
    }

    if (caminhoManifesto !== undefined) {
      return resultado.aprovado ? 0 : 1;
    }

    return resultado.integro ? 0 : 1;
  } catch (erro) {
    registrarErro(`Falha ao analisar logs: ${erro.message}`);
    return 2;
  }
}

const executadoDiretamente =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (executadoDiretamente) {
  process.exitCode = await executarAnaliseLogs({
    caminho: process.argv[2],
    caminhoManifesto: process.argv[3],
  });
}
