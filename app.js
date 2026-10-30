
import express from "express";

import courseRoutes from "./src/routes/course.routes.js";
import authRoutes from "./src/routes/auth.routes.js";
import userRoutes from "./src/routes/user.routes.js";
import categoryRoutes from "./src/routes/category.routes.js";

const app = express();

app.use(express.json());

// Rota inicial
app.get("/", (req, res) => {
  res.status(200).json({
    mensagem: "API da Cyludus funcionando!",
  });
});

// Rotas da API
app.use("/api/auth", authRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);

export default app;
