
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "./src/config/prisma.ts";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Configure ADMIN_EMAIL e ADMIN_PASSWORD no arquivo .env.",
    );
  }

  if (password.length < 12) {
    throw new Error(
      "A nova senha deve ter pelo menos 12 caracteres.",
    );
  }

  const administrador = await prisma.user.findUnique({
    where: { email },
  });

  if (!administrador || administrador.role !== "ADMIN") {
    throw new Error(
      "Nenhum administrador foi encontrado para o e-mail configurado.",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { id: administrador.id },
    data: { passwordHash },
  });

  console.log("Senha do administrador atualizada com sucesso.");
}

main()
  .catch((erro) => {
    console.error("Não foi possível atualizar a senha:", erro.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
