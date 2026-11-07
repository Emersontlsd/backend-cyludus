import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consultarPedidoNotificado: vi.fn(),
  localizarPagamentoNotificado: vi.fn(),
  validarVinculoOrderPagamento: vi.fn(),
  validarPagamentoAprovadoNotificado: vi.fn(),
  verificarPagamentoJaProcessado: vi.fn(),
  consultarPagamentoMercadoPago: vi.fn(),
  validarDataAprovacaoMercadoPago: vi.fn(),
  validarPrazoAprovacaoMercadoPago: vi.fn(),
  registrarPagamentoAprovado: vi.fn(),
  buscarOcorrenciaFinanceira: vi.fn(),
}));

vi.mock("../src/modules/payments/payment-webhook.processor.js", () => ({
  consultarPedidoNotificado: mocks.consultarPedidoNotificado,
  localizarPagamentoNotificado: mocks.localizarPagamentoNotificado,
  validarVinculoOrderPagamento: mocks.validarVinculoOrderPagamento,
  validarPagamentoAprovadoNotificado: mocks.validarPagamentoAprovadoNotificado,
  verificarPagamentoJaProcessado: mocks.verificarPagamentoJaProcessado,
}));

vi.mock("../src/modules/payments/mercadopago-order.service.js", () => ({
  consultarPagamentoMercadoPago: mocks.consultarPagamentoMercadoPago,
}));

vi.mock("../src/modules/payments/payment-order.validation.js", () => ({
  validarDataAprovacaoMercadoPago: mocks.validarDataAprovacaoMercadoPago,
  validarPrazoAprovacaoMercadoPago: mocks.validarPrazoAprovacaoMercadoPago,
}));

vi.mock("../src/modules/payments/payment-webhook.persistence.js", () => ({
  registrarPagamentoAprovado: mocks.registrarPagamentoAprovado,
}));

vi.mock("../src/modules/payments/payment-incident.service.js", () => ({
  buscarOcorrenciaFinanceira: mocks.buscarOcorrenciaFinanceira,
}));

import { processarWebhookPagamento } from "../src/modules/payments/payment-webhook.orchestrator.js";

describe("Orquestração do webhook do Mercado Pago", () => {
  const agora = new Date("2026-11-04T15:10:00.000Z");
  const dataAprovacao = new Date("2026-11-04T14:50:00.000Z");
  const expiresAt = new Date("2026-11-04T15:00:00.000Z");

  const order = {
    id: "order-456",
  };

  const pagamento = {
    id: "pagamento-123",
    enrollmentId: "inscricao-123",
    providerOrderId: "order-456",
    status: "PENDING",
    enrollment: {
      id: "inscricao-123",
      status: "EXPIRED",
      expiresAt,
    },
  };

  const transacao = {
    providerPaymentId: "789",
    paymentMethod: "pix",
    installments: 1,
  };

  const pagamentoConsultado = {
    id: 789,
    status: "approved",
    date_approved: "2026-11-04T14:50:00.000Z",
  };

  beforeEach(() => {
    vi.resetAllMocks();

    mocks.consultarPedidoNotificado.mockResolvedValue(order);
    mocks.localizarPagamentoNotificado.mockResolvedValue(pagamento);

    mocks.validarVinculoOrderPagamento.mockReturnValue(true);
    mocks.validarPagamentoAprovadoNotificado.mockReturnValue(transacao);

    mocks.consultarPagamentoMercadoPago.mockResolvedValue(pagamentoConsultado);

    mocks.validarDataAprovacaoMercadoPago.mockReturnValue(dataAprovacao);

    mocks.validarPrazoAprovacaoMercadoPago.mockReturnValue(true);
    mocks.verificarPagamentoJaProcessado.mockReturnValue(false);

    mocks.registrarPagamentoAprovado.mockResolvedValue({
      paymentStatus: "APPROVED",
      enrollmentStatus: "ACTIVE",
    });

    mocks.buscarOcorrenciaFinanceira.mockResolvedValue(null);
  });

  it("aprova pagamento dentro do prazo mesmo com webhook atrasado", async () => {
    const resultado = await processarWebhookPagamento({
      orderId: "order-456",
      agora,
    });

    expect(mocks.consultarPedidoNotificado).toHaveBeenCalledWith({
      orderId: "order-456",
    });

    expect(mocks.localizarPagamentoNotificado).toHaveBeenCalledWith({
      order,
    });

    expect(mocks.consultarPagamentoMercadoPago).toHaveBeenCalledWith({
      id: "789",
    });

    expect(mocks.validarDataAprovacaoMercadoPago).toHaveBeenCalledWith({
      pagamentoConsultado,
      providerPaymentId: "789",
      pagamento,
    });

    expect(mocks.validarPrazoAprovacaoMercadoPago).toHaveBeenCalledWith({
      dataAprovacao,
      expiresAt,
      agora,
    });

    expect(mocks.registrarPagamentoAprovado).toHaveBeenCalledWith({
      pagamento,
      transacao,
      dataAprovacao,
      agora,
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "ACTIVE",
      alreadyProcessed: false,
    });
  });

  it("não registra novamente um pagamento já processado", async () => {
    mocks.localizarPagamentoNotificado.mockResolvedValue({
      ...pagamento,
      status: "APPROVED",
      providerPaymentId: "789",
      enrollment: {
        ...pagamento.enrollment,
        status: "ACTIVE",
      },
    });

    mocks.verificarPagamentoJaProcessado.mockReturnValue(true);

    const resultado = await processarWebhookPagamento({
      orderId: "order-456",
      agora,
    });

    expect(mocks.verificarPagamentoJaProcessado).toHaveBeenCalledOnce();

    expect(mocks.registrarPagamentoAprovado).not.toHaveBeenCalled();

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "ACTIVE",
      alreadyProcessed: true,
    });
  });

  it("interrompe processamento quando a transação aprovada diverge da registrada", async () => {
    const erro = Object.assign(
      new Error("O pagamento já foi aprovado com outra transação."),
      { statusCode: 409 },
    );

    mocks.verificarPagamentoJaProcessado.mockImplementation(() => {
      throw erro;
    });

    await expect(
      processarWebhookPagamento({
        orderId: "order-456",
        agora,
      }),
    ).rejects.toThrow("O pagamento já foi aprovado com outra transação.");

    expect(mocks.verificarPagamentoJaProcessado).toHaveBeenCalledOnce();

    expect(mocks.registrarPagamentoAprovado).not.toHaveBeenCalled();
  });

  it("registra ocorrência financeira para pagamento aprovado após o vencimento", async () => {
    const dataAprovacaoTardia = new Date("2026-11-04T15:05:00.000Z");

    mocks.validarDataAprovacaoMercadoPago.mockReturnValue(dataAprovacaoTardia);

    mocks.validarPrazoAprovacaoMercadoPago.mockImplementation(() => {
      const erro = new Error(
        "O pagamento foi aprovado após o vencimento da inscrição.",
      );

      erro.statusCode = 422;
      erro.code = "PAYMENT_APPROVED_AFTER_EXPIRATION";

      throw erro;
    });

    mocks.registrarPagamentoAprovado.mockResolvedValue({
      paymentStatus: "APPROVED",
      enrollmentStatus: "EXPIRED",
      incidentType: "ENROLLMENT_EXPIRED",
    });

    const resultado = await processarWebhookPagamento({
      orderId: "order-456",
      agora,
    });

    expect(mocks.validarPrazoAprovacaoMercadoPago).toHaveBeenCalledWith({
      dataAprovacao: dataAprovacaoTardia,
      expiresAt,
      agora,
    });

    expect(mocks.registrarPagamentoAprovado).toHaveBeenCalledWith({
      pagamento,
      transacao,
      dataAprovacao: dataAprovacaoTardia,
      agora,
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "EXPIRED",
      incidentType: "ENROLLMENT_EXPIRED",
      alreadyProcessed: false,
    });
  });

  it("reconhece pagamento já aprovado mesmo após o vencimento da inscrição", async () => {
    mocks.localizarPagamentoNotificado.mockResolvedValue({
      ...pagamento,
      status: "APPROVED",
      providerPaymentId: "789",
      enrollment: {
        ...pagamento.enrollment,
        status: "ACTIVE",
      },
    });

    mocks.verificarPagamentoJaProcessado.mockReturnValue(true);

    mocks.validarPrazoAprovacaoMercadoPago.mockImplementation(() => {
      const erro = new Error(
        "O pagamento foi aprovado após o vencimento da inscrição.",
      );
      erro.statusCode = 422;
      throw erro;
    });

    const resultado = await processarWebhookPagamento({
      orderId: "order-456",
      agora,
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "ACTIVE",
      alreadyProcessed: true,
    });

    expect(mocks.validarPrazoAprovacaoMercadoPago).not.toHaveBeenCalled();

    expect(mocks.registrarPagamentoAprovado).not.toHaveBeenCalled();
  });

  it("rejeita pagamento aprovado quando a inscrição não está ativa", async () => {
    const pagamentoInconsistente = {
      ...pagamento,
      status: "APPROVED",
      providerPaymentId: "789",
      enrollment: {
        ...pagamento.enrollment,
        status: "PENDING",
      },
    };

    mocks.localizarPagamentoNotificado.mockResolvedValue(
      pagamentoInconsistente,
    );

    mocks.verificarPagamentoJaProcessado.mockReturnValue(true);

    await expect(
      processarWebhookPagamento({
        orderId: "order-456",
        agora,
      }),
    ).rejects.toMatchObject({
      message: "O pagamento está aprovado, mas a inscrição não está ativa.",
      statusCode: 409,
    });

    expect(mocks.registrarPagamentoAprovado).not.toHaveBeenCalled();

    expect(mocks.validarPrazoAprovacaoMercadoPago).not.toHaveBeenCalled();
  });

  it("mantém a inscrição cancelada ao registrar o pagamento aprovado", async () => {
    const pagamentoCancelado = {
      ...pagamento,
      status: "PENDING",
      enrollment: {
        ...pagamento.enrollment,
        status: "CANCELLED",
      },
    };

    mocks.localizarPagamentoNotificado.mockResolvedValue(pagamentoCancelado);

    mocks.registrarPagamentoAprovado.mockResolvedValue({
      paymentStatus: "APPROVED",
      enrollmentStatus: "CANCELLED",
      incidentType: "ENROLLMENT_CANCELLED",
    });

    const resultado = await processarWebhookPagamento({
      orderId: "order-456",
      agora,
    });

    expect(mocks.registrarPagamentoAprovado).toHaveBeenCalledOnce();

    expect(mocks.registrarPagamentoAprovado).toHaveBeenCalledWith({
      pagamento: pagamentoCancelado,
      transacao,
      dataAprovacao,
      agora,
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "CANCELLED",
      incidentType: "ENROLLMENT_CANCELLED",
      alreadyProcessed: false,
    });
  });

  it("propaga conflito quando outro webhook já processou o pagamento", async () => {
    const erroConcorrencia = Object.assign(
      new Error("O pagamento não está disponível para aprovação."),
      { statusCode: 409 },
    );

    mocks.registrarPagamentoAprovado.mockRejectedValue(erroConcorrencia);

    await expect(
      processarWebhookPagamento({
        orderId: "order-456",
        agora,
      }),
    ).rejects.toMatchObject({
      message: "O pagamento não está disponível para aprovação.",
      statusCode: 409,
    });

    expect(mocks.registrarPagamentoAprovado).toHaveBeenCalledOnce();
  });

  it("recupera aprovação concorrente da mesma transação", async () => {
    const erroConcorrencia = Object.assign(
      new Error("O pagamento não está disponível para aprovação."),
      { statusCode: 409 },
    );

    const pagamentoAprovado = {
      ...pagamento,
      status: "APPROVED",
      providerPaymentId: transacao.providerPaymentId,
      enrollment: {
        ...pagamento.enrollment,
        status: "ACTIVE",
      },
    };

    mocks.registrarPagamentoAprovado.mockRejectedValue(erroConcorrencia);

    mocks.localizarPagamentoNotificado
      .mockResolvedValueOnce(pagamento)
      .mockResolvedValueOnce(pagamentoAprovado);

    mocks.verificarPagamentoJaProcessado.mockImplementation(
      ({ pagamento: pagamentoVerificado, providerPaymentId }) =>
        pagamentoVerificado.status === "APPROVED" &&
        pagamentoVerificado.providerPaymentId === providerPaymentId,
    );

    const resultado = await processarWebhookPagamento({
      orderId: "order-456",
      agora,
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "ACTIVE",
      alreadyProcessed: true,
    });

    expect(mocks.localizarPagamentoNotificado).toHaveBeenCalledTimes(2);

    expect(mocks.registrarPagamentoAprovado).toHaveBeenCalledOnce();

    expect(mocks.buscarOcorrenciaFinanceira).not.toHaveBeenCalled();
  });

  it("rejeita conflito concorrente quando pagamento continua pendente", async () => {
    const erroConcorrencia = Object.assign(
      new Error("O pagamento não está disponível para aprovação."),
      { statusCode: 409 },
    );

    mocks.registrarPagamentoAprovado.mockRejectedValue(erroConcorrencia);

    mocks.localizarPagamentoNotificado
      .mockResolvedValueOnce(pagamento)
      .mockResolvedValueOnce(pagamento);

    await expect(
      processarWebhookPagamento({
        orderId: "order-456",
        agora,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "O pagamento não está disponível para aprovação.",
    });

    expect(mocks.localizarPagamentoNotificado).toHaveBeenCalledTimes(2);
    expect(mocks.registrarPagamentoAprovado).toHaveBeenCalledOnce();
  });

  it("rejeita recuperação concorrente com transação divergente", async () => {
    const erroConcorrencia = Object.assign(
      new Error("O pagamento não está disponível para aprovação."),
      { statusCode: 409 },
    );

    const pagamentoDivergente = {
      ...pagamento,
      status: "APPROVED",
      providerPaymentId: "999",
      enrollment: {
        ...pagamento.enrollment,
        status: "ACTIVE",
      },
    };

    mocks.registrarPagamentoAprovado.mockRejectedValue(erroConcorrencia);

    mocks.localizarPagamentoNotificado
      .mockResolvedValueOnce(pagamento)
      .mockResolvedValueOnce(pagamentoDivergente);

    mocks.verificarPagamentoJaProcessado.mockImplementation(
      ({ pagamento: pagamentoVerificado, providerPaymentId }) =>
        pagamentoVerificado.status === "APPROVED" &&
        pagamentoVerificado.providerPaymentId === providerPaymentId,
    );

    await expect(
      processarWebhookPagamento({
        orderId: "order-456",
        agora,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "O pagamento não está disponível para aprovação.",
    });

    expect(mocks.localizarPagamentoNotificado).toHaveBeenCalledTimes(2);
    expect(mocks.registrarPagamentoAprovado).toHaveBeenCalledOnce();
    expect(mocks.buscarOcorrenciaFinanceira).not.toHaveBeenCalled();
  });

  it("rejeita pagamento pendente com inscrição já ativa", async () => {
    mocks.localizarPagamentoNotificado.mockResolvedValue({
      ...pagamento,
      status: "PENDING",
      enrollment: {
        ...pagamento.enrollment,
        status: "ACTIVE",
      },
    });

    await expect(
      processarWebhookPagamento({
        orderId: "order-456",
        agora,
      }),
    ).rejects.toMatchObject({
      message: "O pagamento está pendente, mas a inscrição já está ativa.",
      statusCode: 409,
    });

    expect(mocks.registrarPagamentoAprovado).not.toHaveBeenCalled();
  });

  it("rejeita pagamento reembolsado sem tentar aprová-lo novamente", async () => {
    mocks.localizarPagamentoNotificado.mockResolvedValue({
      ...pagamento,
      status: "REFUNDED",
    });

    await expect(
      processarWebhookPagamento({
        orderId: "order-456",
        agora,
      }),
    ).rejects.toMatchObject({
      message: "O pagamento não está disponível para aprovação.",
      statusCode: 409,
    });

    expect(mocks.registrarPagamentoAprovado).not.toHaveBeenCalled();
  });

  it("reconhece webhook repetido quando existe ocorrência ENROLLMENT_CONFLICT", async () => {
    const pagamentoComConflito = {
      ...pagamento,
      status: "APPROVED",
      providerPaymentId: "789",
      enrollment: {
        ...pagamento.enrollment,
        status: "EXPIRED",
      },
    };

    mocks.localizarPagamentoNotificado.mockResolvedValue(pagamentoComConflito);

    mocks.verificarPagamentoJaProcessado.mockReturnValue(true);

    mocks.buscarOcorrenciaFinanceira.mockResolvedValue({
      id: "ocorrencia-123",
      paymentId: "pagamento-123",
      type: "ENROLLMENT_CONFLICT",
      status: "OPEN",
      providerPaymentId: "789",
    });

    const resultado = await processarWebhookPagamento({
      orderId: "order-456",
      agora,
    });

    expect(mocks.buscarOcorrenciaFinanceira).toHaveBeenCalledWith({
      paymentId: "pagamento-123",
      providerPaymentId: "789",
      types: [
        "ENROLLMENT_CONFLICT",
        "ENROLLMENT_EXPIRED",
        "ENROLLMENT_CANCELLED",
      ],
    });

    expect(mocks.registrarPagamentoAprovado).not.toHaveBeenCalled();

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "EXPIRED",
      incidentType: "ENROLLMENT_CONFLICT",
      alreadyProcessed: true,
    });
  });

  it("reconhece pagamento já processado com ocorrência ENROLLMENT_EXPIRED", async () => {
    mocks.localizarPagamentoNotificado.mockResolvedValue({
      ...pagamento,
      status: "APPROVED",
      providerPaymentId: "789",
      enrollment: {
        ...pagamento.enrollment,
        status: "EXPIRED",
      },
    });

    mocks.verificarPagamentoJaProcessado.mockReturnValue(true);

    mocks.buscarOcorrenciaFinanceira.mockResolvedValue({
      id: "ocorrencia-expirada",
      paymentId: "pagamento-123",
      providerPaymentId: "789",
      type: "ENROLLMENT_EXPIRED",
      status: "OPEN",
    });

    const resultado = await processarWebhookPagamento({
      orderId: "order-456",
      agora,
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "EXPIRED",
      incidentType: "ENROLLMENT_EXPIRED",
      alreadyProcessed: true,
    });

    expect(mocks.registrarPagamentoAprovado).not.toHaveBeenCalled();
    expect(mocks.validarPrazoAprovacaoMercadoPago).not.toHaveBeenCalled();
  });

  it("reconhece webhook repetido com ocorrencia financeira resolvida", async () => {
    const pagamentoAprovado = {
      ...pagamento,
      status: "APPROVED",
      providerPaymentId: "789",
      enrollment: {
        ...pagamento.enrollment,
        status: "EXPIRED",
      },
    };

    mocks.localizarPagamentoNotificado.mockResolvedValue(pagamentoAprovado);

    mocks.verificarPagamentoJaProcessado.mockReturnValue(true);

    const ocorrenciaResolvida = {
      id: "ocorrencia-resolvida-123",
      paymentId: "pagamento-123",
      providerPaymentId: "789",
      type: "ENROLLMENT_EXPIRED",
      status: "RESOLVED",
    };

    mocks.buscarOcorrenciaFinanceira.mockResolvedValue(ocorrenciaResolvida);

    const resultado = await processarWebhookPagamento({
      orderId: "order-456",
      agora,
    });

    expect(mocks.verificarPagamentoJaProcessado).toHaveBeenCalledWith({
      pagamento: pagamentoAprovado,
      providerPaymentId: "789",
    });

    expect(mocks.buscarOcorrenciaFinanceira).toHaveBeenCalledWith({
      paymentId: "pagamento-123",
      providerPaymentId: "789",
      types: [
        "ENROLLMENT_CONFLICT",
        "ENROLLMENT_EXPIRED",
        "ENROLLMENT_CANCELLED",
      ],
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "EXPIRED",
      incidentType: "ENROLLMENT_EXPIRED",
      alreadyProcessed: true,
    });

    expect(mocks.registrarPagamentoAprovado).not.toHaveBeenCalled();
    expect(mocks.validarPrazoAprovacaoMercadoPago).not.toHaveBeenCalled();
  });

  it("reconhece pagamento já processado com ocorrência ENROLLMENT_CANCELLED", async () => {
    mocks.localizarPagamentoNotificado.mockResolvedValue({
      ...pagamento,
      status: "APPROVED",
      providerPaymentId: "789",
      enrollment: {
        ...pagamento.enrollment,
        status: "CANCELLED",
      },
    });

    mocks.verificarPagamentoJaProcessado.mockReturnValue(true);

    mocks.buscarOcorrenciaFinanceira.mockResolvedValue({
      id: "ocorrencia-cancelada",
      paymentId: "pagamento-123",
      providerPaymentId: "789",
      type: "ENROLLMENT_CANCELLED",
      status: "OPEN",
    });

    const resultado = await processarWebhookPagamento({
      orderId: "order-456",
      agora,
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "CANCELLED",
      incidentType: "ENROLLMENT_CANCELLED",
      alreadyProcessed: true,
    });

    expect(mocks.registrarPagamentoAprovado).not.toHaveBeenCalled();
    expect(mocks.validarPrazoAprovacaoMercadoPago).not.toHaveBeenCalled();
  });

  it("rejeita pagamento aprovado com inscrição expirada sem ocorrência financeira", async () => {
    mocks.localizarPagamentoNotificado.mockResolvedValue({
      ...pagamento,
      status: "APPROVED",
      providerPaymentId: "789",
      enrollment: {
        ...pagamento.enrollment,
        status: "EXPIRED",
      },
    });

    mocks.verificarPagamentoJaProcessado.mockReturnValue(true);

    mocks.buscarOcorrenciaFinanceira.mockResolvedValue(null);

    await expect(
      processarWebhookPagamento({
        orderId: "order-456",
        agora,
      }),
    ).rejects.toMatchObject({
      message: "O pagamento está aprovado, mas a inscrição não está ativa.",
      statusCode: 409,
    });

    expect(mocks.buscarOcorrenciaFinanceira).toHaveBeenCalledOnce();
    expect(mocks.registrarPagamentoAprovado).not.toHaveBeenCalled();
    expect(mocks.validarPrazoAprovacaoMercadoPago).not.toHaveBeenCalled();
  });

  it("rejeita ocorrência financeira incompatível com o estado da inscrição", async () => {
    mocks.localizarPagamentoNotificado.mockResolvedValue({
      ...pagamento,
      status: "APPROVED",
      providerPaymentId: "789",
      enrollment: {
        ...pagamento.enrollment,
        status: "CANCELLED",
      },
    });

    mocks.verificarPagamentoJaProcessado.mockReturnValue(true);

    mocks.buscarOcorrenciaFinanceira.mockResolvedValue({
      id: "ocorrencia-incompativel",
      paymentId: "pagamento-123",
      providerPaymentId: "789",
      type: "ENROLLMENT_EXPIRED",
      status: "OPEN",
    });

    await expect(
      processarWebhookPagamento({
        orderId: "order-456",
        agora,
      }),
    ).rejects.toMatchObject({
      message: "O pagamento está aprovado, mas a inscrição não está ativa.",
      statusCode: 409,
    });

    expect(mocks.buscarOcorrenciaFinanceira).toHaveBeenCalledOnce();

    expect(mocks.registrarPagamentoAprovado).not.toHaveBeenCalled();

    expect(mocks.validarPrazoAprovacaoMercadoPago).not.toHaveBeenCalled();
  });

  it("rejeita webhook repetido com identificador de transação divergente", async () => {
    const pagamentoAprovado = {
      ...pagamento,
      status: "APPROVED",
      providerPaymentId: "789",
      enrollment: {
        ...pagamento.enrollment,
        status: "EXPIRED",
      },
    };

    mocks.localizarPagamentoNotificado.mockResolvedValue(pagamentoAprovado);

    const erro = Object.assign(
      new Error("O pagamento já foi aprovado com outra transação."),
      { statusCode: 409 },
    );

    mocks.verificarPagamentoJaProcessado.mockImplementation(
      ({ pagamento, providerPaymentId }) => {
        if (pagamento.providerPaymentId !== providerPaymentId) {
          throw erro;
        }

        return true;
      },
    );

    // Simula uma notificação referente a outra transação.
    mocks.validarPagamentoAprovadoNotificado.mockReturnValue({
      ...transacao,
      providerPaymentId: "999",
    });

    await expect(
      processarWebhookPagamento({
        orderId: "order-456",
        agora,
      }),
    ).rejects.toMatchObject({
      message: "O pagamento já foi aprovado com outra transação.",
      statusCode: 409,
    });

    expect(mocks.verificarPagamentoJaProcessado).toHaveBeenCalledWith({
      pagamento: pagamentoAprovado,
      providerPaymentId: "999",
    });

    expect(mocks.buscarOcorrenciaFinanceira).not.toHaveBeenCalled();
    expect(mocks.registrarPagamentoAprovado).not.toHaveBeenCalled();
  });

  it("registra pagamento aprovado de inscrição cancelada sem reativá-la", async () => {
    const pagamentoCancelado = {
      ...pagamento,
      status: "PENDING",
      enrollment: {
        ...pagamento.enrollment,
        status: "CANCELLED",
      },
    };

    mocks.localizarPagamentoNotificado.mockResolvedValue(pagamentoCancelado);

    mocks.registrarPagamentoAprovado.mockResolvedValue({
      paymentStatus: "APPROVED",
      enrollmentStatus: "CANCELLED",
      incidentType: "ENROLLMENT_CANCELLED",
    });

    const resultado = await processarWebhookPagamento({
      orderId: "order-456",
      agora,
    });

    expect(mocks.registrarPagamentoAprovado).toHaveBeenCalledWith({
      pagamento: pagamentoCancelado,
      transacao,
      dataAprovacao,
      agora,
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "CANCELLED",
      incidentType: "ENROLLMENT_CANCELLED",
      alreadyProcessed: false,
    });

    expect(mocks.buscarOcorrenciaFinanceira).not.toHaveBeenCalled();
  });

  it("concilia pagamento aprovado após o vencimento sem ativar inscrição", async () => {
    const dataAprovacaoTardia = new Date("2026-11-04T15:05:00.000Z");

    mocks.validarDataAprovacaoMercadoPago.mockReturnValue(dataAprovacaoTardia);

    mocks.validarPrazoAprovacaoMercadoPago.mockImplementation(() => {
      const erro = new Error(
        "O pagamento foi aprovado após o vencimento da inscrição.",
      );

      erro.statusCode = 422;
      erro.code = "PAYMENT_APPROVED_AFTER_EXPIRATION";

      throw erro;
    });

    mocks.registrarPagamentoAprovado.mockResolvedValue({
      paymentStatus: "APPROVED",
      enrollmentStatus: "EXPIRED",
      incidentType: "ENROLLMENT_EXPIRED",
    });

    const resultado = await processarWebhookPagamento({
      orderId: "order-456",
      agora,
    });

    expect(mocks.registrarPagamentoAprovado).toHaveBeenCalledWith({
      pagamento,
      transacao,
      dataAprovacao: dataAprovacaoTardia,
      agora,
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "EXPIRED",
      incidentType: "ENROLLMENT_EXPIRED",
      alreadyProcessed: false,
    });
  });

  it("rejeita pagamento com data de aprovação futura", async () => {
    const dataFutura = new Date("2026-11-04T15:20:00.000Z");

    mocks.validarDataAprovacaoMercadoPago.mockReturnValue(dataFutura);

    mocks.validarPrazoAprovacaoMercadoPago.mockImplementation(() => {
      const erro = new Error(
        "A data de aprovação do pagamento está no futuro.",
      );
      erro.statusCode = 422;
      throw erro;
    });

    await expect(
      processarWebhookPagamento({
        orderId: "order-456",
        agora,
      }),
    ).rejects.toMatchObject({
      message: "A data de aprovação do pagamento está no futuro.",
      statusCode: 422,
    });

    expect(mocks.validarPrazoAprovacaoMercadoPago).toHaveBeenCalledWith({
      dataAprovacao: dataFutura,
      expiresAt,
      agora,
    });

    expect(mocks.registrarPagamentoAprovado).not.toHaveBeenCalled();
  });

  it("rejeita pagamento com data de aprovação inválida", async () => {
    const dataInvalida = new Date("data-invalida");

    mocks.validarDataAprovacaoMercadoPago.mockReturnValue(dataInvalida);

    mocks.validarPrazoAprovacaoMercadoPago.mockImplementation(() => {
      const erro = new Error(
        "As datas de aprovação ou vencimento são inválidas.",
      );

      erro.statusCode = 422;
      throw erro;
    });

    await expect(
      processarWebhookPagamento({
        orderId: "order-456",
        agora,
      }),
    ).rejects.toMatchObject({
      message: "As datas de aprovação ou vencimento são inválidas.",
      statusCode: 422,
    });

    expect(mocks.validarPrazoAprovacaoMercadoPago).toHaveBeenCalledWith({
      dataAprovacao: dataInvalida,
      expiresAt,
      agora,
    });

    expect(mocks.registrarPagamentoAprovado).not.toHaveBeenCalled();
  });

  it("recupera aprovação concorrente com inscrição cancelada e ocorrência financeira", async () => {
    const erroConcorrencia = Object.assign(
      new Error("O pagamento não está disponível para aprovação."),
      { statusCode: 409 },
    );

    const pagamentoAprovado = {
      ...pagamento,
      status: "APPROVED",
      providerPaymentId: transacao.providerPaymentId,
      enrollment: {
        ...pagamento.enrollment,
        status: "CANCELLED",
      },
    };

    mocks.registrarPagamentoAprovado.mockRejectedValue(erroConcorrencia);

    mocks.localizarPagamentoNotificado
      .mockResolvedValueOnce(pagamento)
      .mockResolvedValueOnce(pagamentoAprovado);

    mocks.verificarPagamentoJaProcessado.mockImplementation(
      ({ pagamento: atual, providerPaymentId }) =>
        atual.status === "APPROVED" &&
        atual.providerPaymentId === providerPaymentId,
    );

    mocks.buscarOcorrenciaFinanceira.mockResolvedValue({
      type: "ENROLLMENT_CANCELLED",
      status: "OPEN",
    });

    const resultado = await processarWebhookPagamento({
      orderId: "order-456",
      agora,
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "CANCELLED",
      incidentType: "ENROLLMENT_CANCELLED",
      alreadyProcessed: true,
    });

    expect(mocks.buscarOcorrenciaFinanceira).toHaveBeenCalledWith({
      paymentId: pagamento.id,
      providerPaymentId: transacao.providerPaymentId,
      types: [
        "ENROLLMENT_CONFLICT",
        "ENROLLMENT_EXPIRED",
        "ENROLLMENT_CANCELLED",
      ],
    });

    expect(mocks.registrarPagamentoAprovado).toHaveBeenCalledOnce();
  });
});
