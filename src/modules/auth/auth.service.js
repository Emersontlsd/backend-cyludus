import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma.ts";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';

if (!JWT_SECRET) {
    throw new Error("A variável JWT_SECRET não foi configurada.");
}

export async function cadastrarUsuario({
    name,
    email,
    password
}) {
    const passwordHash = await bcrypt.hash(password, 12);

    return prisma.user.create({
        data: {
            name,
            email: email.trim().toLowerCase(),
            passwordHash,
            role: "USER"
        },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
        },
    });
}

export async function autenticarUsuario(email, password) {
    const usuario = await prisma.user.findUnique({
        where: {
            email: email.trim().toLowerCase(),
        },
    });

    if (!usuario || !usuario.isActive) {
        return null;
    }

    const senhaValida = await bcrypt.compare(
        password,
        usuario.passwordHash,
    );

    if (!senhaValida) {
        return null;
    }

    const token = jwt.sign(
        {
            role: usuario.role
        },
        JWT_SECRET,
        {
            subject: usuario.id,
            expiresIn: JWT_EXPIRES_IN,
        },
    );

    return {
        usuario: {
            id: usuario.id,
            name: usuario.name,
            email: usuario.email,
            role: usuario.role,
        },
        token
    };
}