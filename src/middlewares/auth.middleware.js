import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma.ts";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("A variável JWT_SECRET não foi configurada.");
}

export async function autenticarToken(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer")) {
    return res.status(401).json({
      mensagem: "Token de autenticação não informado.",
    });
  }

  const token = authorization.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    if (typeof payload !== "object" || typeof payload.sub !== "string") {
      return res.status(401).json({
        mensagem: "Token de autenticação inválido.",
      });
    }

    const usuario = await prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!usuario || !usuario.isActive) {
      return res.status(401).json({
        mensagem: "Usuário inválido ou inativo.",
      });
    }

    req.usuario = usuario;

    return next();
  } catch (erro) {
    if (
      erro?.name === "JsonWebTokenError" ||
      erro?.name === "TokenExpiredError" ||
      erro?.name === "NotBeforeError"
    ) {
      return res.status(401).json({
        mensagem: "Token inválido ou expirado.",
      });
    }

    console.error("Erro ao autenticar usuário: ", erro);

    return res.status(500).json({
      mensagem: "Não foi possível validar a autenticação.",
    });
  }
}

export function exigirAdministrador(req, res, next) {
  if (req.usuario?.role !== "ADMIN") {
    return res.status(403).json({
      mensagem: "Acesso permitido apenas para administradores.",
    });
  }

  return next();
}
