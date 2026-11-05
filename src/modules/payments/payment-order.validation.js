function criarErroValidacao(mensagem) {
    const erro = new Error(mensagem);
    erro.statusCode = 422;
    return erro;
}

function converterParaCentavos(valor) {
    const texto = String(valor);

    if (!/^\d+(\.\d{1,2})?$/.test(texto)) {
        throw criarErroValidacao("Valor monetário inválido.");
    }

    const [inteiro, decimal = ""] = texto.split(".");
    const centavos = BigInt(inteiro) * 100n +
        BigInt(decimal.padEnd(2, "0"));

    return centavos;
}

export function validarIdentidadeOrderMercadoPago({
    order,
    pagamento,
}) {
    if (!order || !pagamento) {
        throw criarErroValidacao(
            "Dados insuficientes para validar o pedido.",
        );
    }

    if (
        !pagamento.providerOrderId ||
        order.id !== pagamento.providerOrderId
    ) {
        throw criarErroValidacao(
            "O identificador do pedido não corresponde ao pagamento.",
        );
    }

    if (order.external_reference !== pagamento.id) {
        throw criarErroValidacao(
            "A referência externa do pedido não corresponde ao pagamento.",
        );
    }

    if (
        order.currency !== pagamento.currency ||
        order.currency !== "BRL"
    ) {
        throw criarErroValidacao(
            "A moeda do pedido não corresponde ao pagamento.",
        );
    }

    const valorPedido = converterParaCentavos(order.total_amount);
    const valorPagamento = converterParaCentavos(pagamento.amount);

    if (valorPedido !== valorPagamento) {
        throw criarErroValidacao(
            "O valor do pedido não corresponde ao pagamento.",
        );
    }

    return true;
}

export function validarTransacaoAprovadaMercadoPago({
    order,
    pagamento,
}) {
    // confirma que o pedido pertence ao pagamento registrado
    validarIdentidadeOrderMercadoPago({ order, pagamento });

    const transacoes = order.transactions;

    if(!transacoes || !Array.isArray(transacoes.payments)) {
        throw criarErroValidacao(
            "O pedido não possui transações de pagamento válidas.",
        );
    }

    const pagamentosAprovados = transacoes.payments.filter(
        (transacao) => transacao?.status === "approved",
    );

    if (pagamentosAprovados.length !== 1) {
        throw criarErroValidacao(
            "O pedido não possui uma única transação aprovada.",
        );
    }

    const transacao = pagamentosAprovados[0];

    if (typeof transacao.id !== "string" || !transacao.id.trim()) {
        throw criarErroValidacao(
            "A transação aprovada não possui identificador válido.",
        );
    }

    const valorEsperado = converterParaCentavos(pagamento.amount);

    if (
        converterParaCentavos(transacao.amount) !== valorEsperado ||
        converterParaCentavos(transacao.paid_amount) !== valorEsperado ||
        converterParaCentavos(order.total_paid_amount) !== valorEsperado
    ) {
        throw criarErroValidacao(
            "O valor efetivamente pago não corresponde ao pagamento.",
        );
    }

    // não autorizar a ativação se houver reembolso ou estorno
    if (
        Array.isArray(transacoes.refunds) &&
        transacoes.refunds.length > 0
    ) {
        throw criarErroValidacao(
            "O pedido possui registros de reembolso.",
        );
    }

    if (
        Array.isArray(transacoes.chargebacks) &&
        transacoes.chargebacks.length > 0
    ) {
        throw criarErroValidacao(
            "O pedido possui registros de estorno.",
        );
    }

    if (
        converterParaCentavos(transacao.refunded_amount ?? "0") !== 0n
    ) {
        throw criarErroValidacao(
            "A transação possui valor reembolsado.",
        );
    }

    const metodo = transacao.payment_method;

    if (
        !metodo ||
        typeof metodo.type !== "string" ||
        !metodo.type.trim()
    ) {
        throw criarErroValidacao(
            "A forma de pagamento não foi identificada.",
        );
    }

    const parcelas = metodo.installments ?? 1;

    if (
        !Number.isInteger(parcelas) ||
        parcelas < 1 ||
        parcelas > 12
    ) {
        throw criarErroValidacao(
            "A quantidade de parcelas é inválida.",
        );
    }

    return {
        providerPaymentId: transacao.id,
        paymentMethod: metodo.type,
        installments: parcelas,
    };
}