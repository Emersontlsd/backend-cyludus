
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "./src/config/prisma.ts";

async function main() {
  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !email || !password) {
    throw new Error(
      "Configure ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD no arquivo .env.",
    );
  }

  if (password.length < 12) {
    throw new Error("A senha do administrador deve ter pelo menos 12 caracteres.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const usuarioExistente = await prisma.user.findUnique({
    where: { email },
  });

  if (usuarioExistente) {
    throw new Error(
      "Já existe um usuário com esse e-mail. Nenhuma alteração foi realizada.",
    );
  }

  const administrador = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: "ADMIN",
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  console.log("Administrador criado com sucesso:");
  console.log(administrador);
}

main()
  .catch((erro) => {
    console.error("Não foi possível criar o administrador:", erro.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
