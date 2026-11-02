export function construirOrderRequest({
    pagamento,
    inscricao,
}) {
    const valor = Number(pagamento.amount).toFixed(2);

    const nomeCompleto = inscricao.user.name.trim().split(/\s+/);
    const primeiroNome = nomeCompleto[0];
    const sobrenome = nomeCompleto.slice(1).join(" ");

    const payer = {
        email: inscricao.user.email,
        first_name: primeiroNome,
    };

    if (sobrenome) {
        payer.last_name = sobrenome;
    }

    return {
        type: "online",
        processing_mode: "manual",
        external_reference: pagamento.id,

        total_amount: valor,
        currency: "BRL",

        description: `Inscrição no curso ${inscricao.course.title}`,

        payer,

        transactions: {
            payments: [
                {
                    amount: valor,
                    date_of_expiration: inscricao.expiresAt.toISOString(),
                },
            ],
        },

        items: [
            {
                title: inscricao.course.title,
                description: `Acesso ao curso ${inscricao.course.title}`,
                category_id: "education",
                quantity: 1,
                unit_measure: "unit",
                unit_price: valor,
            },
        ],

        config: {
            payment_method: {
                max_installments: 12,
            },
        },
    };
}