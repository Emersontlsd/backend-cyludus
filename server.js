import "dotenv/config";
import express from 'express';

import courseRoutes from "./src/routes/course.routes.js";
import authRoutes from "./src/routes/auth.routes.js";
import userRoutes from "./src/routes/user.routes.js";
import categoryRoutes from "./src/routes/category.routes.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// rota inicial
app.get("/", (req, res) => {
    res.status(200).json({
        mensagem: "API da Cyludus funcionando!",
    });
});

// rota de autenticação
app.use("/api/auth", authRoutes);

// rotas de cursos
app.use("/api/courses", courseRoutes);

// Rotas de usuários
app.use("/api/users", userRoutes);

// Rotas de categorias
app.use("/api/categories", categoryRoutes);






app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});