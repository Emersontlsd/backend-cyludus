import { prisma } from "../../config/prisma.ts";

const camposUsuariosPublicos = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updateAt: true,
};

export async function listarUsuarios() {
    return prisma.user.findMany({
        select: camposUsuariosPublicos,
        orderBy: {
            createdAt: "desc",
        },
    });
}

export async function buscarUsuarioPorId(id) {
    return prisma.user.findUnique({
        where: { id },
        select: camposUsuariosPublicos,
    });
}

export async function alterarStatusUsuario(id, isActive) {
    return prisma.user.update({
        where: { id },
        data: { isActive },
        select: camposUsuariosPublicos,
    });
}

