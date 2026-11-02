import { Router } from "express";

import { autenticarToken } from "../middlewares/auth.middleware.js";

const router = Router();

// todas as rotas exigem autenticação
router.use(autenticarToken);

export default router;

