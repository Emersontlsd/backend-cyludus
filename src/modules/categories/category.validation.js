
import { z } from "zod";

const nomeCategoriaSchema = z
  .string()
  .trim()
  .min(2, "O nome da categoria deve ter pelo menos 2 caracteres.")
  .max(80, "O nome da categoria deve ter no máximo 80 caracteres.");

const slugCategoriaSchema = z
  .string()
  .trim()
  .min(2, "O slug deve ter pelo menos 2 caracteres.")
  .max(100, "O slug deve ter no máximo 100 caracteres.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "O slug deve conter apenas letras minúsculas, números e hífens.",
  );

export const criarCategoriaSchema = z
  .object({
    name: nomeCategoriaSchema,
    slug: slugCategoriaSchema,
  })
  .strict();

export const atualizarCategoriaSchema = criarCategoriaSchema
  .partial()
  .refine(
    (dados) => Object.keys(dados).length > 0,
    "Informe pelo menos um campo para atualizar.",
  );
