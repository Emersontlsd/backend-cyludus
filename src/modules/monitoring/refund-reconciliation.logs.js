import { readFile } from "node:fs/promises";

import { analisarIntegridadeReconciliacao } from "./refund-reconciliation.integrity.js";

import { analisarCompletudeReconciliacao } from "./refund-reconciliation.completeness.js";

const EVENTOS_RECONCILIACAO = new Set([
  "REFUND_RECONCILIATION_COMPLETED",
  "REFUND_RECONCILIATION_SKIPPED_LOCKED",
  "REFUND_RECONCILIATION_FAILED",
]);

const SOURCE = "refund-reconciliation";

function objetoValido(valor) {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

export function extrairRegistrosReconciliacao(conteudo) {
  if (typeof conteudo !== "string") {
    throw new TypeError("O conteúdo dos logs deve ser uma string.");
  }

  const registros = [];
  let linhasIgnoradas = 0;
  let linhasInvalidas = 0;

  for (const linha of conteudo.split(/\r?\n/)) {
    const texto = linha.trim();

    if (!texto) continue;

    let registro;

    try {
      registro = JSON.parse(texto);
    } catch {
      // Mensagens comuns do executor não são registros JSON.
      // Linhas que começam com um objeto ou array JSON,
      // mas não podem ser interpretadas, são consideradas inválidas.
      if (texto.startsWith("{") || texto.startsWith("[")) {
        linhasInvalidas++;
      } else {
        linhasIgnoradas++;
      }

      continue;
    }

    if (!objetoValido(registro)) {
      linhasIgnoradas++;
      continue;
    }

    if (
      registro.source === SOURCE ||
      EVENTOS_RECONCILIACAO.has(registro.event)
    ) {
      registros.push(registro);
    } else {
      linhasIgnoradas++;
    }
  }

  return {
    registros,
    linhasIgnoradas,
    linhasInvalidas,
  };
}

export function analisarLogsReconciliacao(conteudo) {
  const extracao = extrairRegistrosReconciliacao(conteudo);
  const integridade = analisarIntegridadeReconciliacao(extracao.registros);

  return {
    ...integridade,
    linhasIgnoradas: extracao.linhasIgnoradas,
    linhasInvalidas: extracao.linhasInvalidas,
  };
}

export async function analisarArquivoLogsReconciliacao(caminho) {
  if (typeof caminho !== "string" || !caminho.trim()) {
    throw new TypeError("Informe um caminho válido para o arquivo.");
  }

  const conteudo = await readFile(caminho, "utf8");

  return analisarLogsReconciliacao(conteudo);
}

export function analisarLogsComManifestoReconciliacao(conteudo, manifesto) {
  const extracao = extrairRegistrosReconciliacao(conteudo);

  const integridade = analisarIntegridadeReconciliacao(extracao.registros);

  const completude = analisarCompletudeReconciliacao(
    manifesto,
    extracao.registros,
  );

  return {
    aprovado:
      integridade.integro &&
      completude.completo &&
      extracao.linhasInvalidas === 0,

    integridade,
    completude,

    linhasIgnoradas: extracao.linhasIgnoradas,
    linhasInvalidas: extracao.linhasInvalidas,
  };
}
