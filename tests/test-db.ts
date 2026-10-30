
import { prisma } from "../src/config/prisma.ts";

try {
  await prisma.$connect();

  const tabelas = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;

  console.log("Tabelas no Supabase:");
  console.log(tabelas);

  const cursos = await prisma.course.count();

  console.log("Quantidade de cursos cadastrados:", cursos);
} catch (erro) {
  console.error("Erro ao verificar o banco.");

  if (erro instanceof Error) {
    console.error(erro.message);
  }

  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
