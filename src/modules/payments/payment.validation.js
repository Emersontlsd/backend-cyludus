import { z } from "zod";

export const criarPagamentoSchema = z
    .object({
        enrollmentId: z
            .string()
            .uuid("ID da inscrição inválido."),
    })
    .strict();

    