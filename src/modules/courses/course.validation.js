import { z } from "zod";

const urlOpcionalSchema = z
  .string()
  .trim()
  .url("Informe uma URL válida.")
  .max(2048, "A URL deve ter no máximo 2048 caracteres.")
  .refine(
    (valor) => /^https?:\/\//i.test(valor),
    "A URL deve começar com http:// ou https://.",
  )
  .optional();

export const criarCursoSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "O título deve conter pelo menos 3 caracteres.")
      .max(150, "O título deve conter no máximo 150 caracteres."),

    slug: z
      .string()
      .trim()
      .min(3, "O slug deve ter pelo menos 3 caracteres.")
      .max(160, "O slug deve ter no máximo 160 caracteres.")
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "O slug deve conter apenas letras minúsculas, números e hífens.",
      ),

    description: z
      .string()
      .trim()
      .max(5000, "A descrição deve ter no máximo 5000 caracteres.")
      .optional(),

    price: z
      .number()
      .finite("O preço deve ser um número válido.")
      .min(0, "O preço não pode ser negativo.")
      .max(99999999.99, "O preço informado é muito alto.")
      .refine(
        (valor) => Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-8,
        "O preço deve conter no máximo duas casas decimais.",
      ),

    isPublished: z.boolean().optional(),

    categoryId: z
      .string()
      .uuid("Informe um ID de categoria válido.")
      .nullable()
      .optional(),

    imageUrl: urlOpcionalSchema,

    instructorImageUrl: urlOpcionalSchema,

    badge: z
      .string()
      .trim()
      .max(50, "O selo deve ter no máximo 50 caracteres.")
      .optional(),

    instructorDescription: z
      .string()
      .trim()
      .max(3000, "A descrição do instrutor deve ter no máximo 3000 caracteres.")
      .optional(),

    observations: z
      .string()
      .trim()
      .max(5000, "As observações devem ter no máximo 5000 caracteres.")
      .optional(),

    subjects: z.array(z.string().trim().min(1)).max(100).optional(),

    schedule: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(150),
            description: z.string().trim().max(2000).optional(),
            date: z.string().trim().max(100).optional(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
  })
  .strict();

export const atualizarCursoParcialSchema = criarCursoSchema
  .partial()
  .refine(
    (dados) => Object.keys(dados).length > 0,
    "Informe pelo menos um campo para atualizar.",
  );
