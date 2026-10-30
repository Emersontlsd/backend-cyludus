
import "dotenv/config";
import { prisma } from "./src/config/prisma.ts";
import { listarUsuarios } from "./src/modules/users/user.service.js";

async function main() {
  try {
    const usuarios = await listarUsuarios();

    console.log("Serviço de usuários funcionando.");
    console.log("Quantidade de usuários:", usuarios.length);
    console.log(
      "Campos retornados:",
      usuarios[0] ? Object.keys(usuarios[0]) : "Nenhum usuário encontrado",
    );
  } catch (erro) {
    console.error("Erro completo:", erro);
    console.error("Mensagem:", erro?.message);
    console.error("Código:", erro?.code);
  } finally {
    await prisma.$disconnect();
  }
}

main();
