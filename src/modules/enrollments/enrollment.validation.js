import { z } from "zod";

export const criarInscricaoSchema = z
    .object({
        courseId: z.string().uuid("ID do curso inválido."),
    })
    .strict();