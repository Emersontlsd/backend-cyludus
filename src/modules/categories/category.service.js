import { prisma } from "../../config/prisma.ts";

const camposCategoria = {
    id: true,
    name: true,
    slug: true,
    createdAt: true,
    updatedAt: true,
};

export async function listarCategorias() {
    return prisma.category.findMany({
        orderBy: { name: "asc" },
        select: camposCategoria,
    });
}

export async function buscarCategoriaPorSlug(slug) {
    return prisma.category.findUnique({
        where: { slug },
        select: camposCategoria,
    });
}

export async function criarCategoria(dados) {
    return prisma.category.create({
        data: {
            name: dados.name,
            slug: dados.slug,
        },
        select: camposCategoria,
    });
}

export async function atualizarCategoria(id, dados) {
    return prisma.category.update({
        where: { id },
        data: {
            name: dados.name,
            slug: dados.slug,
        },
        select: camposCategoria,
    });
}

export async function excluirCategoria(id) {
  return prisma.category.delete({
    where: { id },
    select: camposCategoria,
  });
}