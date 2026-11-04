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
