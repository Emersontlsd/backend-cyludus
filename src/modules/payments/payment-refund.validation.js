import { validarIdentidadeOrderMercadoPago } from "./payment-order.validation.js";

function criarErro(mensagem) {
  const erro = new Error(mensagem);
  erro.statusCode = 422;
  return erro;
}

function converterCentavos(valor) {
  const texto = String(valor ?? "").trim();

  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) {
    throw criarErro("Valor monetário inválido.");
  }

  const [inteiro, decimal = ""] = texto.split(".");

  return BigInt(inteiro) * 100n + BigInt(decimal.padEnd(2, "0"));
}

function validarIdentificadoresUnicos(reembolsos) {
  const identificadores = new Set();

  for (const reembolso of reembolsos) {
    const id = reembolso?.id;

    if (
      (typeof id !== "string" && typeof id !== "number") ||
      !String(id).trim()
    ) {
      throw criarErro("O reembolso não possui identificador válido.");
    }

    const identificador = String(id).trim();

    if (identificadores.has(identificador)) {
      throw criarErro(
        "Foram encontrados identificadores de reembolso duplicados.",
      );
    }

    identificadores.add(identificador);
  }
}

function validarConsistenciaReembolsos(reembolsosOrder, reembolsosPagamento) {
  const mensagemErro =
    "Os registros de reembolso das APIs Order e Payment são inconsistentes.";

  if (reembolsosOrder.length !== reembolsosPagamento.length) {
    throw criarErro(mensagemErro);
  }

  function criarResumo(reembolsos) {
    return reembolsos
      .map((reembolso) => {
        const valor = converterCentavos(reembolso.amount);
        const status = reembolso.status;

        if (typeof status !== "string" || !status.trim()) {
          throw criarErro(mensagemErro);
        }

        return `${status}:${valor.toString()}`;
      })
      .sort();
  }

  const resumoOrder = criarResumo(reembolsosOrder);
  const resumoPagamento = criarResumo(reembolsosPagamento);

  for (let indice = 0; indice < resumoOrder.length; indice++) {
    if (resumoOrder[indice] !== resumoPagamento[indice]) {
      throw criarErro(mensagemErro);
    }
  }
}

export function validarReembolsoTotalMercadoPago({
  order,
  pagamento,
  pagamentoMercadoPago,
}) {
  validarIdentidadeOrderMercadoPago({ order, pagamento });

  const providerPaymentId = pagamento?.providerPaymentId;

  if (
    typeof providerPaymentId !== "string" ||
    !providerPaymentId.trim() ||
    String(pagamentoMercadoPago?.id) !== providerPaymentId
  ) {
    throw criarErro("O reembolso não corresponde ao pagamento original.");
  }

  const transacoes = order?.transactions?.payments;

  if (!Array.isArray(transacoes) || transacoes.length !== 1) {
    throw criarErro("A transação original não foi identificada.");
  }

  const transacao = transacoes[0];

  if (String(transacao?.id) !== providerPaymentId) {
    throw criarErro("O reembolso não corresponde ao pagamento original.");
  }

  const valorOriginal = converterCentavos(pagamento.amount);

  if (
    valorOriginal <= 0n ||
    converterCentavos(transacao.amount) !== valorOriginal ||
    converterCentavos(transacao.paid_amount) !== valorOriginal ||
    converterCentavos(pagamentoMercadoPago?.transaction_amount) !==
      valorOriginal
  ) {
    throw criarErro("Os valores do pagamento são inconsistentes.");
  }

  if (
    Array.isArray(order?.transactions?.chargebacks) &&
    order.transactions.chargebacks.length > 0
  ) {
    throw criarErro("O pedido possui registros de chargeback.");
  }

  const reembolsosOrder = order?.transactions?.refunds;
  const reembolsosPagamento = pagamentoMercadoPago?.refunds;

  if (!Array.isArray(reembolsosOrder) || !Array.isArray(reembolsosPagamento)) {
    throw criarErro("Os dados do reembolso são insuficientes.");
  }

  validarIdentificadoresUnicos(reembolsosOrder);
  validarIdentificadoresUnicos(reembolsosPagamento);
  validarConsistenciaReembolsos(reembolsosOrder, reembolsosPagamento);
  let totalOrder = 0n;

  for (const reembolso of reembolsosOrder) {
    if (String(reembolso?.transaction_id) !== providerPaymentId) {
      throw criarErro("O reembolso não corresponde ao pagamento original.");
    }

    if (reembolso.status === "approved") {
      totalOrder += converterCentavos(reembolso.amount);
    }
  }

  let totalPagamento = 0n;

  for (const reembolso of reembolsosPagamento) {
    if (String(reembolso?.payment_id) !== providerPaymentId) {
      throw criarErro("O reembolso não corresponde ao pagamento original.");
    }

    if (reembolso.status === "approved") {
      totalPagamento += converterCentavos(reembolso.amount);
    }
  }

  const acumuladoOrder = converterCentavos(transacao.refunded_amount);

  const acumuladoPagamento = converterCentavos(
    pagamentoMercadoPago?.transaction_amount_refunded,
  );

  if (
    totalOrder > valorOriginal ||
    totalPagamento > valorOriginal ||
    acumuladoOrder > valorOriginal ||
    acumuladoPagamento > valorOriginal
  ) {
    throw criarErro("O valor reembolsado excede o pagamento original.");
  }

  if (
    totalOrder !== valorOriginal ||
    totalPagamento !== valorOriginal ||
    acumuladoOrder !== valorOriginal ||
    acumuladoPagamento !== valorOriginal
  ) {
    const erro = criarErro("O reembolso total ainda não foi confirmado.");

    erro.code = "REFUND_NOT_FULLY_CONFIRMED";

    throw erro;
  }

  return {
    providerPaymentId,
    valorReembolsado: `${valorOriginal / 100n}.${String(
      valorOriginal % 100n,
    ).padStart(2, "0")}`,
  };
}
