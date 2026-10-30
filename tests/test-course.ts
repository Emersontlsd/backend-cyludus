
import { prisma } from "../src/config/prisma.ts";

try {
  const curso = await prisma.course.create({
    data: {
      title: "Curso de Teste Cyludus",
      slug: "curso-de-teste-cyludus",
      description: "Curso fictício para validar a API durante o desenvolvimento.",
      price: 49.90,
      isPublished: true,
    },
  });

  console.log("Curso de teste cadastrado com sucesso!");
  console.log(curso);
} catch (erro) {
  console.error("Não foi possível cadastrar o curso.");

  if (erro instanceof Error) {
    console.error(erro.message);
  }

  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
