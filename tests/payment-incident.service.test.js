import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
}));

vi.mock("../src/config/prisma.ts", () => ({
  prisma: {
    paymentIncident: {
      findFirst: mocks.findFirst,
      create: mocks.create,
    },
  },
}));

import {
  registrarOcorrenciaFinanceira,
  buscarOcorrenciaFinanceira,
} from "../src/modules/payments/payment-incident.service.js";

describe("Serviço de ocorrências financeiras", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("registra uma ocorrência financeira aberta", async () => {
    const incident = {
      id: "incidente-123",
      paymentId: "pagamento-123",
      type: "ENROLLMENT_EXPIRED",
      status: "OPEN",
      reason: "Pagamento aprovado após o vencimento.",
      providerPaymentId: "789",
    };

    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue(incident);

    const resultado = await registrarOcorrenciaFinanceira({
      paymentId: "pagamento-123",
      type: "ENROLLMENT_EXPIRED",
      reason: "Pagamento aprovado após o vencimento.",
      providerPaymentId: "789",
    });

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        paymentId: "pagamento-123",
        type: "ENROLLMENT_EXPIRED",
        status: "OPEN",
      },
    });

    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        paymentId: "pagamento-123",
        type: "ENROLLMENT_EXPIRED",
        reason: "Pagamento aprovado após o vencimento.",
        providerPaymentId: "789",
        status: "OPEN",
      },
    });

    expect(resultado).toEqual({
      incident,
      alreadyExists: false,
    });
  });

  it("reutiliza uma ocorrência financeira aberta existente", async () => {
    const incident = {
      id: "incidente-123",
      paymentId: "pagamento-123",
      type: "ENROLLMENT_EXPIRED",
      status: "OPEN",
      reason: "Pagamento aprovado após o vencimento.",
      providerPaymentId: "789",
    };

    mocks.findFirst.mockResolvedValue(incident);

    const resultado = await registrarOcorrenciaFinanceira({
      paymentId: "pagamento-123",
      type: "ENROLLMENT_EXPIRED",
      reason: "Pagamento aprovado após o vencimento.",
      providerPaymentId: "789",
    });

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        paymentId: "pagamento-123",
        type: "ENROLLMENT_EXPIRED",
        status: "OPEN",
      },
    });

    expect(mocks.create).not.toHaveBeenCalled();

    expect(resultado).toEqual({
      incident,
      alreadyExists: true,
    });
  });

  it("recupera a ocorrência criada por outra requisição após erro P2002", async () => {
    const incident = {
      id: "incidente-123",
      paymentId: "pagamento-123",
      type: "ENROLLMENT_EXPIRED",
      status: "OPEN",
      reason: "Pagamento aprovado após o vencimento.",
      providerPaymentId: "789",
    };

    // Primeira consulta: ainda não existe ocorrência.
    // Segunda consulta: outra requisição já criou o registro.
    mocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(incident);

    mocks.create.mockRejectedValue({
      code: "P2002",
    });

    const resultado = await registrarOcorrenciaFinanceira({
      paymentId: "pagamento-123",
      type: "ENROLLMENT_EXPIRED",
      reason: "Pagamento aprovado após o vencimento.",
      providerPaymentId: "789",
    });

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.findFirst).toHaveBeenCalledTimes(2);

    expect(resultado).toEqual({
      incident,
      alreadyExists: true,
    });
  });

  it("propaga o erro P2002 quando a ocorrência não é encontrada", async () => {
    const erroPrisma = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });

    mocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    mocks.create.mockRejectedValue(erroPrisma);

    await expect(
      registrarOcorrenciaFinanceira({
        paymentId: "pagamento-123",
        type: "ENROLLMENT_EXPIRED",
        reason: "Pagamento aprovado após o vencimento.",
        providerPaymentId: "789",
      }),
    ).rejects.toBe(erroPrisma);

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.findFirst).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      descricao: "paymentId ausente",
      dados: {
        paymentId: "",
        type: "ENROLLMENT_EXPIRED",
        reason: "Pagamento aprovado após o vencimento.",
      },
    },
    {
      descricao: "tipo ausente",
      dados: {
        paymentId: "pagamento-123",
        type: "",
        reason: "Pagamento aprovado após o vencimento.",
      },
    },
    {
      descricao: "motivo ausente",
      dados: {
        paymentId: "pagamento-123",
        type: "ENROLLMENT_EXPIRED",
        reason: " ",
      },
    },
  ])("rejeita ocorrência com $descricao", async ({ dados }) => {
    await expect(registrarOcorrenciaFinanceira(dados)).rejects.toMatchObject({
      statusCode: 400,
      message: "Os dados da ocorrência financeira são inválidos.",
    });

    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("propaga erros inesperados do Prisma sem ocultá-los", async () => {
    const erroPrisma = new Error("Falha de conexão com o banco de dados.");

    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockRejectedValue(erroPrisma);

    await expect(
      registrarOcorrenciaFinanceira({
        paymentId: "pagamento-123",
        type: "ENROLLMENT_EXPIRED",
        reason: "Pagamento aprovado após o vencimento.",
        providerPaymentId: "789",
      }),
    ).rejects.toBe(erroPrisma);

    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("utiliza o cliente transacional informado", async () => {
    const incident = {
      id: "incidente-transacional-123",
      paymentId: "pagamento-123",
      type: "ENROLLMENT_EXPIRED",
      status: "OPEN",
      reason: "Pagamento aprovado após o vencimento.",
      providerPaymentId: "789",
    };

    const db = {
      paymentIncident: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(incident),
      },
    };

    const resultado = await registrarOcorrenciaFinanceira({
      paymentId: "pagamento-123",
      type: "ENROLLMENT_EXPIRED",
      reason: "Pagamento aprovado após o vencimento.",
      providerPaymentId: "789",
      db,
    });

    expect(db.paymentIncident.findFirst).toHaveBeenCalledTimes(1);

    expect(db.paymentIncident.create).toHaveBeenCalledWith({
      data: {
        paymentId: "pagamento-123",
        type: "ENROLLMENT_EXPIRED",
        reason: "Pagamento aprovado após o vencimento.",
        providerPaymentId: "789",
        status: "OPEN",
      },
    });

    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();

    expect(resultado).toEqual({
      incident,
      alreadyExists: false,
    });
  });

  it("propaga P2002 sem consultar novamente dentro da transação", async () => {
    const erroPrisma = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });

    const db = {
      paymentIncident: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(erroPrisma),
      },
    };

    await expect(
      registrarOcorrenciaFinanceira({
        paymentId: "pagamento-123",
        type: "ENROLLMENT_EXPIRED",
        reason: "Pagamento aprovado após o vencimento.",
        providerPaymentId: "789",
        db,
      }),
    ).rejects.toBe(erroPrisma);

    expect(db.paymentIncident.findFirst).toHaveBeenCalledTimes(1);
    expect(db.paymentIncident.create).toHaveBeenCalledTimes(1);

    // Não tenta consultar novamente após o conflito.
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("reconhece ocorrencia financeira resolvida em webhook repetido", async () => {
    const incident = {
      id: "incidente-resolvido-123",
      paymentId: "pagamento-123",
      providerPaymentId: "789",
      type: "ENROLLMENT_EXPIRED",
      status: "RESOLVED",
      reason: "Pagamento aprovado apos o vencimento.",
    };

    mocks.findFirst.mockResolvedValue(incident);

    const resultado = await buscarOcorrenciaFinanceira({
      paymentId: "pagamento-123",
      providerPaymentId: "789",
      types: ["ENROLLMENT_EXPIRED"],
    });

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        paymentId: "pagamento-123",
        providerPaymentId: "789",
        type: {
          in: ["ENROLLMENT_EXPIRED"],
        },
        status: {
          in: ["OPEN", "RESOLVED"],
        },
      },
    });

    expect(resultado).toEqual(incident);

    // A consulta nao deve criar nem modificar ocorrencias.
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
