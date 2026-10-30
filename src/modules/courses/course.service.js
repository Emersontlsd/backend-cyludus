import { prisma } from "../../config/prisma.ts";

const camposCursoPublico = {
  id: true,
  title: true,
  slug: true,
  description: true,
  price: true,
  imageUrl: true,
  instructorImageUrl: true,
  badge: true,
  instructorDescription: true,
  observations: true,
  subjects: true,
  schedule: true,
  categoryId:true,
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  createdAt: true,
};

const camposCursoAdmin = {
  ...camposCursoPublico,
  isPublished: true,
  updatedAt: true,
};

export async function listarCursosPublicados() {
  return prisma.course.findMany({
    where: {
      isPublished: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: camposCursoPublico,
  });
}

export async function buscarCursoPorSlug(slug) {
  return prisma.course.findFirst({
    where: {
      slug,
      isPublished: true,
    },
    select: camposCursoPublico,
  });
}

export async function criarCurso(dados) {
  return prisma.course.create({
    data: {
      title: dados.title,
      slug: dados.slug,
      description: dados.description,
      price: dados.price,
      isPublished: dados.isPublished ?? false,
      imageUrl: dados.imageUrl,
      instructorImageUrl: dados.instructorImageUrl,
      badge: dados.badge,
      instructorDescription: dados.instructorDescription,
      observations: dados.observations,
      subjects: dados.subjects,
      schedule: dados.schedule,
      categoryId: dados.categoryId,
    },
    select: camposCursoAdmin,
  });
}

export async function atualizarCurso(id, dados) {
  const data = {
    title: dados.title,
    slug: dados.slug,
    price: dados.price,
  };

  const camposOpcionais = [
        "description",
        "isPublished",
        "imageUrl",
        "instructorImageUrl",
        "badge",
        "instructorDescription",
        "observations",
        "subjects",
        "schedule",
        "categoryId",
    ];

    for (const campo of camposOpcionais) {
        if (dados[campo] !== undefined) {
            data[campo] = dados[campo];
        }
    }

  return prisma.course.update({
    where: {
      id,
    },
    data,
    select: camposCursoAdmin,
  });
}

export async function excluirCurso(id) {
  return prisma.course.delete({
    where: {
      id,
    },
    select: {
      id: true,
      title: true,
      slug: true,
    },
  });
}

export async function listarTodosCursosAdmin() {
  return prisma.course.findMany({
    orderBy: {
      createdAt: "desc",
    },
    select: camposCursoAdmin,
  });
}
