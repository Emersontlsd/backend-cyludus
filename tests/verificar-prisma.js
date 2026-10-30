
import { prisma } from "../src/config/prisma.ts";

async function main() {
  console.log("Modelo User:", typeof prisma.user);
  console.log("Modelo Course:", typeof prisma.course);
}

main()
  .catch((erro) => {
    console.error("Erro ao verificar Prisma:", erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
