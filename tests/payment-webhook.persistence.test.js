import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config/prisma.ts", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import { prisma } from "../src/config/prisma.ts";

import { registrarPagamentoAprovado } from "../src/modules/payments/payment-webhook.persistence.js";

describe("Persistência do webhook do Mercado Pago", () => {
  // Datas compartilhadas por todos os testes.
  const agora = new Date("2026-11-04T12:00:00.000Z");
  const dataAprovacao = new Date("2026-11-04T11:30:00.000Z");

  const pagamentoBase = {
    id: "pagamento-123",
    enrollmentId: "inscricao-123",
    providerOrderId: "order-456",
    status: "PENDING",
  };

  const transacaoBase = {
    providerPaymentId: "transacao-789",
    paymentMethod: "credit_card",
    installments: 3,
  };

  // Impede que chamadas de um teste afetem os demais.
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function criarTransacaoMock({
    pagamento = pagamentoBase,
    pagamentoAtualizado = 1,
    inscricaoAtualizada = 1,
    statusInscricao = "PENDING",
    expiresAt = new Date("2026-11-05T12:00:00.000Z"),
  } = {}) {
    return {
      payment: {
        findUnique: vi.fn().mockResolvedValue(pagamento),
        updateMany: vi.fn().mockResolvedValue({
          count: pagamentoAtualizado,
        }),
      },

      enrollment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "inscricao-123",
          status: statusInscricao,
          expiresAt,
        }),
        updateMany: vi.fn().mockResolvedValue({
          count: inscricaoAtualizada,
        }),
      },

      paymentIncident: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }) => ({
          id: "incidente-123",
          ...data,
        })),
      },
    };
  }

  function configurarTransacao(tx) {
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
  }

  it("aprova o pagamento e ativa a inscrição na mesma transação", async () => {
    const tx = criarTransacaoMock();

    configurarTransacao(tx);

    const resultado = await registrarPagamentoAprovado({
      pagamento: pagamentoBase,
      transacao: transacaoBase,
      dataAprovacao,
      agora,
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();

    expect(tx.payment.findUnique).toHaveBeenCalledWith({
      where: {
        id: "pagamento-123",
      },
    });

    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: "pagamento-123",
        enrollmentId: "inscricao-123",
        status: "PENDING",
        providerOrderId: "order-456",
      },
      data: {
        status: "APPROVED",
        providerPaymentId: "transacao-789",
        paymentMethod: "credit_card",
        installments: 3,
        approvedAt: dataAprovacao,
      },
    });

    expect(tx.enrollment.updateMany).toHaveBeenCalledWith({
      where: {
        id: "inscricao-123",
        status: {
          in: ["PENDING", "EXPIRED"],
        },
        expiresAt: {
          gte: dataAprovacao,
        },
      },
      data: {
        status: "ACTIVE",
        activatedAt: agora,
      },
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "ACTIVE",
    });
  });

  it("interrompe a transação quando a inscrição não pode ser ativada", async () => {
    const tx = criarTransacaoMock({
      inscricaoAtualizada: 0,
    });

    configurarTransacao(tx);

    await expect(
      registrarPagamentoAprovado({
        pagamento: pagamentoBase,
        transacao: transacaoBase,
        dataAprovacao,
        agora,
      }),
    ).rejects.toThrow("A inscrição não está disponível para ativação.");

    expect(tx.payment.updateMany).toHaveBeenCalledOnce();
    expect(tx.enrollment.updateMany).toHaveBeenCalledOnce();
  });

  it("não ativa a inscrição quando o pagamento não está mais pendente", async () => {
    const tx = criarTransacaoMock({
      pagamentoAtualizado: 0,
    });

    configurarTransacao(tx);

    await expect(
      registrarPagamentoAprovado({
        pagamento: pagamentoBase,
        transacao: transacaoBase,
        dataAprovacao,
        agora,
      }),
    ).rejects.toThrow("O pagamento não está disponível para aprovação.");

    expect(tx.payment.updateMany).toHaveBeenCalledOnce();
    expect(tx.enrollment.updateMany).not.toHaveBeenCalled();
  });

  it("rejeita aprovação sem Order vinculada ao pagamento", async () => {
    const pagamento = {
      ...pagamentoBase,
      providerOrderId: null,
    };

    await expect(
      registrarPagamentoAprovado({
        pagamento,
        transacao: transacaoBase,
        dataAprovacao,
        agora,
      }),
    ).rejects.toThrow("O pagamento não possui uma Order vinculada.");

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejeita pagamento cujo vínculo com a Order mudou no banco", async () => {
    const tx = criarTransacaoMock({
      pagamento: {
        ...pagamentoBase,
        providerOrderId: "order-999",
      },
    });

    configurarTransacao(tx);

    await expect(
      registrarPagamentoAprovado({
        pagamento: pagamentoBase,
        transacao: transacaoBase,
        dataAprovacao,
        agora,
      }),
    ).rejects.toThrow("O vínculo da Order com o pagamento foi alterado.");

    expect(tx.payment.findUnique).toHaveBeenCalledWith({
      where: {
        id: "pagamento-123",
      },
    });

    expect(tx.payment.updateMany).not.toHaveBeenCalled();
    expect(tx.enrollment.updateMany).not.toHaveBeenCalled();
  });

  it("não ativa inscrição vencida e registra ocorrência financeira", async () => {
    const tx = criarTransacaoMock({
      statusInscricao: "EXPIRED",
      expiresAt: new Date("2026-11-04T11:00:00.000Z"),
    });

    configurarTransacao(tx);

    const resultado = await registrarPagamentoAprovado({
      pagamento: pagamentoBase,
      transacao: {
        ...transacaoBase,
        paymentMethod: "pix",
        installments: 1,
      },
      dataAprovacao,
      agora,
    });

    expect(tx.enrollment.findUnique).toHaveBeenCalledWith({
      where: {
        id: "inscricao-123",
      },
    });

    // Não libera o curso.
    expect(tx.enrollment.updateMany).not.toHaveBeenCalled();

    // Registra o recebimento financeiro.
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: pagamentoBase.id,
        enrollmentId: pagamentoBase.enrollmentId,
        status: "PENDING",
        providerOrderId: pagamentoBase.providerOrderId,
      },
      data: {
        status: "APPROVED",
        providerPaymentId: transacaoBase.providerPaymentId,
        paymentMethod: "pix",
        installments: 1,
        approvedAt: dataAprovacao,
      },
    });

    // Abre ocorrência para análise administrativa.
    expect(tx.paymentIncident.create).toHaveBeenCalledWith({
      data: {
        paymentId: pagamentoBase.id,
        type: "ENROLLMENT_EXPIRED",
        status: "OPEN",
        reason: "Pagamento aprovado após o vencimento da inscrição.",
        providerPaymentId: transacaoBase.providerPaymentId,
      },
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "EXPIRED",
      incidentType: "ENROLLMENT_EXPIRED",
    });
  });

  it("rejeita data de aprovação inválida antes de iniciar a transação", async () => {
    await expect(
      registrarPagamentoAprovado({
        pagamento: pagamentoBase,
        transacao: transacaoBase,
        dataAprovacao: new Date("data-invalida"),
        agora,
      }),
    ).rejects.toThrow("A data de aprovação informada é inválida.");

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejeita data de aprovação futura antes de iniciar a transação", async () => {
    await expect(
      registrarPagamentoAprovado({
        pagamento: pagamentoBase,
        transacao: transacaoBase,
        dataAprovacao: new Date("2026-11-04T13:00:00.000Z"),
        agora,
      }),
    ).rejects.toThrow("A data de aprovação informada é inválida.");

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("ativa inscrição expirada quando o pagamento foi aprovado dentro do prazo", async () => {
    const agora = new Date("2026-11-04T15:10:00.000Z");
    const dataAprovacao = new Date("2026-11-04T14:50:00.000Z");
    const expiresAt = new Date("2026-11-04T15:00:00.000Z");

    const tx = criarTransacaoMock({
      statusInscricao: "EXPIRED",
      expiresAt,
    });

    configurarTransacao(tx);

    const resultado = await registrarPagamentoAprovado({
      pagamento: pagamentoBase,
      transacao: transacaoBase,
      dataAprovacao,
      agora,
    });

    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: pagamentoBase.id,
        enrollmentId: pagamentoBase.enrollmentId,
        status: "PENDING",
        providerOrderId: pagamentoBase.providerOrderId,
      },
      data: {
        status: "APPROVED",
        providerPaymentId: transacaoBase.providerPaymentId,
        paymentMethod: transacaoBase.paymentMethod,
        installments: transacaoBase.installments,
        approvedAt: dataAprovacao,
      },
    });

    expect(tx.enrollment.updateMany).toHaveBeenCalledWith({
      where: {
        id: pagamentoBase.enrollmentId,
        status: {
          in: ["PENDING", "EXPIRED"],
        },
        expiresAt: {
          gte: dataAprovacao,
        },
      },
      data: {
        status: "ACTIVE",
        activatedAt: agora,
      },
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "ACTIVE",
    });
  });

  it("preserva inscrição cancelada e registra pagamento aprovado dentro do prazo", async () => {
    const tx = criarTransacaoMock({
      statusInscricao: "CANCELLED",
      expiresAt: new Date("2026-11-05T12:00:00.000Z"),
    });

    configurarTransacao(tx);

    const resultado = await registrarPagamentoAprovado({
      pagamento: pagamentoBase,
      transacao: transacaoBase,
      dataAprovacao,
      agora,
    });

    // Confirma que o pagamento foi registrado como aprovado.
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: pagamentoBase.id,
        enrollmentId: pagamentoBase.enrollmentId,
        status: "PENDING",
        providerOrderId: pagamentoBase.providerOrderId,
      },
      data: {
        status: "APPROVED",
        providerPaymentId: transacaoBase.providerPaymentId,
        paymentMethod: transacaoBase.paymentMethod,
        installments: transacaoBase.installments,
        approvedAt: dataAprovacao,
      },
    });

    // Nunca reativa uma inscrição cancelada.
    expect(tx.enrollment.updateMany).not.toHaveBeenCalled();

    // Registra a ocorrência para análise administrativa.
    expect(tx.paymentIncident.create).toHaveBeenCalledWith({
      data: {
        paymentId: pagamentoBase.id,
        type: "ENROLLMENT_CANCELLED",
        status: "OPEN",
        reason: "Pagamento aprovado para uma inscrição cancelada.",
        providerPaymentId: transacaoBase.providerPaymentId,
      },
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "CANCELLED",
      incidentType: "ENROLLMENT_CANCELLED",
    });
  });

  it("propaga conflito de unicidade ao tentar recuperar inscrição expirada", async () => {
    const tx = criarTransacaoMock({
      statusInscricao: "EXPIRED",
      expiresAt: new Date("2026-11-04T12:00:00.000Z"),
    });

    const erroUnicidade = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });

    tx.enrollment.updateMany.mockRejectedValue(erroUnicidade);

    configurarTransacao(tx);

    await expect(
      registrarPagamentoAprovado({
        pagamento: pagamentoBase,
        transacao: transacaoBase,
        dataAprovacao,
        agora,
      }),
    ).rejects.toMatchObject({
      code: "P2002",
    });

    expect(tx.payment.updateMany).toHaveBeenCalledOnce();
    expect(tx.enrollment.updateMany).toHaveBeenCalledOnce();
  });

  it("registra ocorrência quando o pagamento é aprovado após o vencimento", async () => {
    const tx = criarTransacaoMock({
      statusInscricao: "EXPIRED",
      expiresAt: new Date("2026-11-04T11:00:00.000Z"),
    });

    configurarTransacao(tx);

    const resultado = await registrarPagamentoAprovado({
      pagamento: pagamentoBase,
      transacao: transacaoBase,
      dataAprovacao,
      agora,
    });

    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: pagamentoBase.id,
        enrollmentId: pagamentoBase.enrollmentId,
        status: "PENDING",
        providerOrderId: pagamentoBase.providerOrderId,
      },
      data: {
        status: "APPROVED",
        providerPaymentId: transacaoBase.providerPaymentId,
        paymentMethod: transacaoBase.paymentMethod,
        installments: transacaoBase.installments,
        approvedAt: dataAprovacao,
      },
    });

    expect(tx.enrollment.updateMany).not.toHaveBeenCalled();

    expect(tx.paymentIncident.create).toHaveBeenCalledWith({
      data: {
        paymentId: pagamentoBase.id,
        type: "ENROLLMENT_EXPIRED",
        status: "OPEN",
        reason: "Pagamento aprovado após o vencimento da inscrição.",
        providerPaymentId: transacaoBase.providerPaymentId,
      },
    });

    expect(resultado).toMatchObject({
      paymentStatus: "APPROVED",
      enrollmentStatus: "EXPIRED",
      incidentType: "ENROLLMENT_EXPIRED",
    });
  });

  it("propaga falha ao registrar ocorrência financeira", async () => {
    const tx = criarTransacaoMock({
      statusInscricao: "EXPIRED",
      expiresAt: new Date("2026-11-04T11:00:00.000Z"),
    });

    const erroBanco = new Error("Falha ao registrar ocorrência financeira.");

    tx.paymentIncident.create.mockRejectedValue(erroBanco);

    configurarTransacao(tx);

    await expect(
      registrarPagamentoAprovado({
        pagamento: pagamentoBase,
        transacao: transacaoBase,
        dataAprovacao,
        agora,
      }),
    ).rejects.toBe(erroBanco);

    expect(tx.payment.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.paymentIncident.create).toHaveBeenCalledTimes(1);

    // A inscrição não pode ser ativada nesse cenário.
    expect(tx.enrollment.updateMany).not.toHaveBeenCalled();
  });

  it("registra ocorrência quando a inscrição foi cancelada", async () => {
    const tx = criarTransacaoMock({
      statusInscricao: "CANCELLED",
      expiresAt: new Date("2026-11-05T12:00:00.000Z"),
    });

    configurarTransacao(tx);

    const resultado = await registrarPagamentoAprovado({
      pagamento: pagamentoBase,
      transacao: transacaoBase,
      dataAprovacao,
      agora,
    });

    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: pagamentoBase.id,
        enrollmentId: pagamentoBase.enrollmentId,
        status: "PENDING",
        providerOrderId: pagamentoBase.providerOrderId,
      },
      data: {
        status: "APPROVED",
        providerPaymentId: transacaoBase.providerPaymentId,
        paymentMethod: transacaoBase.paymentMethod,
        installments: transacaoBase.installments,
        approvedAt: dataAprovacao,
      },
    });

    // A inscrição cancelada permanece bloqueada.
    expect(tx.enrollment.updateMany).not.toHaveBeenCalled();

    expect(tx.paymentIncident.create).toHaveBeenCalledWith({
      data: {
        paymentId: pagamentoBase.id,
        type: "ENROLLMENT_CANCELLED",
        status: "OPEN",
        reason: "Pagamento aprovado para uma inscrição cancelada.",
        providerPaymentId: transacaoBase.providerPaymentId,
      },
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "CANCELLED",
      incidentType: "ENROLLMENT_CANCELLED",
    });
  });

  it("registra ocorrência financeira após conflito de unicidade na ativação", async () => {
    const erroUnicidade = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: {
        target: "Enrollment_one_open_per_user_course_key",
      },
    });

    const txAtivacao = criarTransacaoMock({
      statusInscricao: "EXPIRED",
    });

    txAtivacao.enrollment.updateMany.mockRejectedValue(erroUnicidade);

    const txOcorrencia = criarTransacaoMock({
      statusInscricao: "EXPIRED",
    });

    // Primeira transação: tentativa de ativação.
    // Segunda transação: registro financeiro após rollback.
    prisma.$transaction
      .mockImplementationOnce(async (callback) => callback(txAtivacao))
      .mockImplementationOnce(async (callback) => callback(txOcorrencia));

    const resultado = await registrarPagamentoAprovado({
      pagamento: pagamentoBase,
      transacao: transacaoBase,
      dataAprovacao,
      agora,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);

    // A tentativa original não conseguiu ativar a inscrição.
    expect(txAtivacao.enrollment.updateMany).toHaveBeenCalledTimes(1);

    // A segunda transação não tenta reativá-la.
    expect(txOcorrencia.enrollment.updateMany).not.toHaveBeenCalled();

    expect(txOcorrencia.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: pagamentoBase.id,
        enrollmentId: pagamentoBase.enrollmentId,
        status: "PENDING",
        providerOrderId: pagamentoBase.providerOrderId,
      },
      data: {
        status: "APPROVED",
        providerPaymentId: transacaoBase.providerPaymentId,
        paymentMethod: transacaoBase.paymentMethod,
        installments: transacaoBase.installments,
        approvedAt: dataAprovacao,
      },
    });

    expect(txOcorrencia.paymentIncident.create).toHaveBeenCalledWith({
      data: {
        paymentId: pagamentoBase.id,
        type: "ENROLLMENT_CONFLICT",
        status: "OPEN",
        reason:
          "Pagamento aprovado, mas existe conflito com outra inscrição aberta.",
        providerPaymentId: transacaoBase.providerPaymentId,
      },
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "EXPIRED",
      incidentType: "ENROLLMENT_CONFLICT",
    });
  });

  it("não trata P2002 de outro índice como conflito de inscrição", async () => {
    const erroUnicidade = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: {
        target: "Payment_providerPaymentId_key",
      },
    });

    const tx = criarTransacaoMock({
      statusInscricao: "EXPIRED",
    });

    tx.enrollment.updateMany.mockRejectedValue(erroUnicidade);

    configurarTransacao(tx);

    await expect(
      registrarPagamentoAprovado({
        pagamento: pagamentoBase,
        transacao: transacaoBase,
        dataAprovacao,
        agora,
      }),
    ).rejects.toBe(erroUnicidade);

    // A segunda transação não deve ser iniciada.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // Nenhuma ocorrência financeira deve ser criada.
    expect(tx.paymentIncident.create).not.toHaveBeenCalled();
  });

  it("concilia pagamento se a inscrição for cancelada antes da segunda transação", async () => {
    const erroUnicidade = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: {
        target: "Enrollment_one_open_per_user_course_key",
      },
    });

    const txAtivacao = criarTransacaoMock({
      statusInscricao: "EXPIRED",
    });

    txAtivacao.enrollment.updateMany.mockRejectedValue(erroUnicidade);

    const txOcorrencia = criarTransacaoMock({
      statusInscricao: "CANCELLED",
    });

    prisma.$transaction
      .mockImplementationOnce(async (callback) => callback(txAtivacao))
      .mockImplementationOnce(async (callback) => callback(txOcorrencia));

    const resultado = await registrarPagamentoAprovado({
      pagamento: pagamentoBase,
      transacao: transacaoBase,
      dataAprovacao,
      agora,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);

    expect(txOcorrencia.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: pagamentoBase.id,
        enrollmentId: pagamentoBase.enrollmentId,
        status: "PENDING",
        providerOrderId: pagamentoBase.providerOrderId,
      },
      data: {
        status: "APPROVED",
        providerPaymentId: transacaoBase.providerPaymentId,
        paymentMethod: transacaoBase.paymentMethod,
        installments: transacaoBase.installments,
        approvedAt: dataAprovacao,
      },
    });

    expect(txOcorrencia.enrollment.updateMany).not.toHaveBeenCalled();

    expect(txOcorrencia.paymentIncident.create).toHaveBeenCalledWith({
      data: {
        paymentId: pagamentoBase.id,
        type: "ENROLLMENT_CANCELLED",
        status: "OPEN",
        reason: "Pagamento aprovado para uma inscrição cancelada.",
        providerPaymentId: transacaoBase.providerPaymentId,
      },
    });

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "CANCELLED",
      incidentType: "ENROLLMENT_CANCELLED",
    });
  });

  it("não processa novamente um pagamento já aprovado", async () => {
    const tx = criarTransacaoMock();

    tx.payment.findUnique.mockResolvedValue({
      ...pagamentoBase,
      status: "APPROVED",
      providerPaymentId: transacaoBase.providerPaymentId,
    });

    configurarTransacao(tx);

    await expect(
      registrarPagamentoAprovado({
        pagamento: pagamentoBase,
        transacao: transacaoBase,
        dataAprovacao,
        agora,
      }),
    ).rejects.toThrow(
      "O pagamento já foi aprovado e não pode ser processado novamente.",
    );

    expect(tx.payment.updateMany).not.toHaveBeenCalled();
    expect(tx.enrollment.updateMany).not.toHaveBeenCalled();
    expect(tx.paymentIncident.create).not.toHaveBeenCalled();
  });

  it("não duplica pagamento aprovado antes da segunda transação", async () => {
    const erroUnicidade = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: {
        target: "Enrollment_one_open_per_user_course_key",
      },
    });

    const txAtivacao = criarTransacaoMock({
      statusInscricao: "EXPIRED",
    });

    txAtivacao.enrollment.updateMany.mockRejectedValue(erroUnicidade);

    const txOcorrencia = criarTransacaoMock({
      statusInscricao: "EXPIRED",
    });

    // Simula outro processamento que aprovou o pagamento
    // antes do início da segunda transação.
    txOcorrencia.payment.findUnique.mockResolvedValue({
      ...pagamentoBase,
      status: "APPROVED",
      providerPaymentId: transacaoBase.providerPaymentId,
    });

    prisma.$transaction
      .mockImplementationOnce(async (callback) => callback(txAtivacao))
      .mockImplementationOnce(async (callback) => callback(txOcorrencia));

    await expect(
      registrarPagamentoAprovado({
        pagamento: pagamentoBase,
        transacao: transacaoBase,
        dataAprovacao,
        agora,
      }),
    ).rejects.toThrow(
      "O pagamento já foi aprovado e não pode ser processado novamente.",
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);

    expect(txOcorrencia.payment.updateMany).not.toHaveBeenCalled();
    expect(txOcorrencia.enrollment.updateMany).not.toHaveBeenCalled();
    expect(txOcorrencia.paymentIncident.create).not.toHaveBeenCalled();
  });

  it("expira inscrição PENDING quando o pagamento é aprovado após o vencimento", async () => {
    const tx = criarTransacaoMock({
      statusInscricao: "PENDING",
      expiresAt: new Date("2026-11-04T11:00:00.000Z"),
    });

    configurarTransacao(tx);

    const resultado = await registrarPagamentoAprovado({
      pagamento: pagamentoBase,
      transacao: transacaoBase,
      dataAprovacao,
      agora,
    });

    // O pagamento é registrado como aprovado.
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: pagamentoBase.id,
        enrollmentId: pagamentoBase.enrollmentId,
        status: "PENDING",
        providerOrderId: pagamentoBase.providerOrderId,
      },
      data: {
        status: "APPROVED",
        providerPaymentId: transacaoBase.providerPaymentId,
        paymentMethod: transacaoBase.paymentMethod,
        installments: transacaoBase.installments,
        approvedAt: dataAprovacao,
      },
    });

    // A inscrição pendente deve ser expirada, nunca ativada.
    expect(tx.enrollment.updateMany).toHaveBeenCalledWith({
      where: {
        id: pagamentoBase.enrollmentId,
        status: "PENDING",
        expiresAt: {
          lt: dataAprovacao,
        },
      },
      data: {
        status: "EXPIRED",
      },
    });

    // A ocorrência financeira deve ser registrada.
    expect(tx.paymentIncident.create).toHaveBeenCalledWith({
      data: {
        paymentId: pagamentoBase.id,
        type: "ENROLLMENT_EXPIRED",
        status: "OPEN",
        reason: "Pagamento aprovado após o vencimento da inscrição.",
        providerPaymentId: transacaoBase.providerPaymentId,
      },
    });

    // Tudo deve acontecer na mesma transação.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    expect(resultado).toEqual({
      paymentStatus: "APPROVED",
      enrollmentStatus: "EXPIRED",
      incidentType: "ENROLLMENT_EXPIRED",
    });
  });
});
