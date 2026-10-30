# Cyludus Backend

API REST da plataforma Cyludus, responsável atualmente por autenticação, gerenciamento de usuários, cursos e categorias.

## Tecnologias

- Node.js
- Express 5
- JavaScript (ES Modules)
- Prisma ORM 7
- PostgreSQL
- Zod
- JWT
- bcryptjs

## Requisitos

- Node.js
- npm
- Banco de dados PostgreSQL acessível

## Instalação

```bash
git clone https://github.com/Emersontlsd/backend-cyludus.git
cd backend-cyludus
npm install
```

## Configuração

Crie um arquivo `.env` na raiz do projeto, com as seguintes variáveis:

```env
DATABASE_URL="SUA_URL_DE_CONEXAO_POSTGRESQL"
JWT_SECRET="SEU_SEGREDO_JWT"
JWT_EXPIRES_IN="15m"
PORT=3000
```

**Importante:** nunca compartilhe ou envie seu `.env` para o GitHub.

| Variável | Finalidade |
|---|---|
| DATABASE_URL | Conexão com PostgreSQL |
| JWT_SECRET | Assinatura e validação dos tokens JWT |
| JWT_EXPIRES_IN | Tempo de validade do token |
| PORT | Porta do servidor |

## Banco de dados

O projeto utiliza Prisma 7.

Para gerar o cliente:

```bash
npx prisma generate
```

Para criar uma migration durante o desenvolvimento:

```bash
npx prisma migrate dev --name nome_da_migracao
```

Para verificar o estado das migrations:

```bash
npx prisma migrate status
```

## Executar o projeto

Modo desenvolvimento:

```bash
npm run dev
```

Modo de execução:

```bash
npm start
```

Por padrão, o servidor estará disponível em:

`http://localhost:3000`

## Endpoints implementados

### Autenticação

- `POST /api/auth/register` — cadastro.
- `POST /api/auth/login` — login.
- `GET /api/auth/me` — usuário autenticado.

### Usuários

- `GET /api/users` — listar usuários.
- `GET /api/users/:id` — consultar usuário.
- `PATCH /api/users/:id/status` — ativar ou desativar usuário.

### Cursos

- `GET /api/courses` — listar cursos publicados.
- `GET /api/courses/:slug` — consultar curso publicado.
- `GET /api/courses/admin/all` — listar todos os cursos.
- `POST /api/courses` — cadastrar curso.
- `PUT /api/courses/:id` — atualizar curso.
- `PATCH /api/courses/:id` — atualizar parcialmente.
- `DELETE /api/courses/:id` — excluir curso.

### Categorias

- `GET /api/categories` — listar categorias.
- `GET /api/categories/:slug` — consultar categoria.
- `POST /api/categories` — cadastrar categoria.
- `PATCH /api/categories/:id` — atualizar categoria.
- `DELETE /api/categories/:id` — excluir categoria.

As rotas administrativas exigem autenticação e permissão de administrador.

## Estrutura do projeto

```text
cyludus-backend/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── src/
│   ├── config/
│   ├── middlewares/
│   ├── modules/
│   │   ├── auth/
│   │   ├── categories/
│   │   ├── courses/
│   │   └── users/
│   └── routes/
├── docs/
│   └── API.md
├── prisma7.config.ts
├── server.js
├── package.json
└── README.md
```

## Segurança

- Senhas armazenadas com hash utilizando bcryptjs.
- Autenticação por JWT.
- Verificação do usuário e de seu status nas rotas protegidas.
- Controle de acesso administrativo.
- Validação dos dados recebidos utilizando Zod.

## Funcionalidades futuras

Os seguintes recursos ainda precisam ser desenvolvidos:

- Integração com Mercado Pago.
- Carrinho e checkout.
- Confirmação de pagamentos.
- Matrículas e liberação de acesso aos cursos.
- Upload e armazenamento de imagens.
- Planos e regras de acesso.

## Documentação da API

Consulte [`docs/API.md`](docs/API.md) para conhecer os endpoints, parâmetros, exemplos de requisições e respostas.

---

Projeto desenvolvido para a plataforma Cyludus.