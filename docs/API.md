# Documentação da API — Cyludus

**Base URL local:** `http://localhost:3000`

Esta documentação descreve os endpoints atualmente implementados no backend da Cyludus.

## 1. Autenticação

As rotas administrativas exigem um token JWT no cabeçalho:

```http
Authorization: Bearer SEU_TOKEN_JWT
```

### 1.1 Cadastrar usuário

`POST /api/auth/register`

**Acesso:** público.

Corpo da requisição:

```json
{
  "name": "Nome do usuário",
  "email": "usuario@email.com",
  "password": "SenhaSegura123"
}
```

Regras:
- Nome entre 3 e 100 caracteres.
- E-mail válido.
- Senha entre 12 e 72 caracteres.

Resposta de sucesso — `201 Created`:

```json
{
  "mensagem": "Usuário cadastrado com sucesso.",
  "usuario": {
    "id": "ID_DO_USUARIO",
    "name": "Nome do usuário",
    "email": "usuario@email.com",
    "role": "USER"
  }
}
```

Possíveis erros:
- `400` — dados inválidos.
- `409` — e-mail já cadastrado.

### 1.2 Login

`POST /api/auth/login`

**Acesso:** público.

Corpo da requisição:

```json
{
  "email": "usuario@email.com",
  "password": "SenhaSegura123"
}
```

Resposta de sucesso — `200 OK`:

```json
{
  "usuario": {
    "id": "ID_DO_USUARIO",
    "name": "Nome do usuário",
    "email": "usuario@email.com",
    "role": "USER"
  },
  "token": "TOKEN_JWT"
}
```

Possíveis erros:
- `400` — dados inválidos.
- `401` — credenciais inválidas ou conta inativa.

### 1.3 Consultar usuário autenticado

`GET /api/auth/me`

**Acesso:** usuário autenticado.

Cabeçalho:

```http
Authorization: Bearer SEU_TOKEN_JWT
```

Retorna os dados do usuário associado ao token.

Possíveis erros:
- `401` — token ausente, inválido ou usuário inativo.

## 2. Usuários

Todas as rotas desta seção exigem autenticação e perfil `ADMIN`.

### 2.1 Listar usuários

`GET /api/users`

Retorna a lista de usuários cadastrados.

### 2.2 Consultar usuário

`GET /api/users/:id`

Exemplo:

`GET /api/users/ID_DO_USUARIO`

Retorna os dados públicos do usuário informado.

### 2.3 Alterar status do usuário

`PATCH /api/users/:id/status`

Corpo da requisição:

```json
{
  "isActive": false
}
```

Utilizado para ativar ou desativar uma conta.

**Observação:** o administrador não pode desativar a própria conta por esse endpoint.

Possíveis erros:
- `400` — identificador ou dados inválidos.
- `401` — não autenticado.
- `403` — usuário sem permissão administrativa.
- `404` — usuário não encontrado.

## 3. Cursos

### 3.1 Listar cursos publicados

`GET /api/courses`

**Acesso:** público.

Retorna somente cursos com `isPublished: true`, ordenados pelos mais recentes.

### 3.2 Consultar curso por slug

`GET /api/courses/:slug`

**Acesso:** público.

Exemplo:

`GET /api/courses/introducao-ao-desenvolvimento`

Retorna somente cursos publicados.

Possíveis erros:
- `404` — curso não encontrado ou não publicado.

### 3.3 Listar todos os cursos

`GET /api/courses/admin/all`

**Acesso:** administrador.

Retorna os cursos publicados e não publicados.

### 3.4 Cadastrar curso

`POST /api/courses`

**Acesso:** administrador.

Exemplo de corpo:

```json
{
  "title": "Introdução ao Desenvolvimento",
  "slug": "introducao-ao-desenvolvimento",
  "description": "Descrição do curso.",
  "price": 199.90,
  "isPublished": false,
  "imageUrl": "https://exemplo.com/imagem.jpg",
  "instructorImageUrl": "https://exemplo.com/instrutor.jpg",
  "badge": "NOVO",
  "instructorDescription": "Descrição do instrutor.",
  "observations": "Informações adicionais.",
  "subjects": [
    "Introdução",
    "Fundamentos",
    "Prática"
  ],
  "schedule": [
    {
      "title": "Módulo 1",
      "description": "Apresentação do conteúdo.",
      "date": "A definir"
    }
  ],
  "categoryId": null
}
```

Campos principais:
- `title`: obrigatório, entre 3 e 150 caracteres.
- `slug`: obrigatório, único, em letras minúsculas, números e hífens.
- `description`: opcional, até 5.000 caracteres.
- `price`: obrigatório, número não negativo com até duas casas decimais.
- `isPublished`: opcional, booleano; padrão `false`.
- `imageUrl`: opcional, URL HTTP ou HTTPS.
- `instructorImageUrl`: opcional, URL HTTP ou HTTPS.
- `badge`: opcional, até 50 caracteres.
- `instructorDescription`: opcional, até 3.000 caracteres.
- `observations`: opcional, até 5.000 caracteres.
- `subjects`: opcional, lista de textos.
- `schedule`: opcional, lista de objetos com `title` obrigatório e `description` e `date` opcionais.
- `categoryId`: opcional, UUID de categoria ou `null`.

### 3.5 Atualizar curso completamente

`PUT /api/courses/:id`

**Acesso:** administrador.

Recebe os dados do curso para atualização. O corpo deve conter os campos obrigatórios de criação, além dos opcionais.

### 3.6 Atualizar curso parcialmente

`PATCH /api/courses/:id`

**Acesso:** administrador.

Permite enviar somente os campos que precisam ser alterados.

Exemplo:

```json
{
  "price": 249.90,
  "isPublished": true
}
```

É necessário enviar pelo menos um campo válido.

### 3.7 Excluir curso

`DELETE /api/courses/:id`

**Acesso:** administrador.

Remove o curso identificado pelo UUID.

Possíveis erros nas operações administrativas:
- `400` — identificador ou dados inválidos.
- `401` — não autenticado.
- `403` — usuário sem permissão administrativa.
- `404` — curso não encontrado.
- `409` — slug já cadastrado.

## 4. Categorias

### 4.1 Listar categorias

`GET /api/categories`

**Acesso:** público.

Retorna as categorias em ordem alfabética.

### 4.2 Consultar categoria por slug

`GET /api/categories/:slug`

**Acesso:** público.

Exemplo:

`GET /api/categories/programacao`

### 4.3 Cadastrar categoria

`POST /api/categories`

**Acesso:** administrador.

Corpo da requisição:

```json
{
  "name": "Programação",
  "slug": "programacao"
}
```

Regras:
- `name`: obrigatório, entre 2 e 80 caracteres.
- `slug`: obrigatório, único, entre 2 e 100 caracteres, com letras minúsculas, números e hífens.

### 4.4 Atualizar categoria

`PATCH /api/categories/:id`

**Acesso:** administrador.

Exemplo:

```json
{
  "name": "Desenvolvimento de Software",
  "slug": "desenvolvimento-de-software"
}
```

É necessário enviar pelo menos um campo válido.

### 4.5 Excluir categoria

`DELETE /api/categories/:id`

**Acesso:** administrador.

Ao excluir uma categoria, os cursos associados permanecem cadastrados, mas ficam sem categoria (`categoryId` passa a `null`).

Possíveis erros:
- `400` — identificador ou dados inválidos.
- `401` — não autenticado.
- `403` — usuário sem permissão administrativa.
- `404` — categoria não encontrada.
- `409` — nome ou slug já cadastrado.

## 5. Autorização e segurança

Os níveis de acesso atuais são:

| Perfil | Permissões |
|---|---|
| `USER` | Cadastro, login e consulta dos próprios dados autenticados |
| `ADMIN` | Operações administrativas de usuários, cursos e categorias |

A API utiliza:
- JWT para autenticação.
- bcryptjs para hash de senhas.
- Zod para validação de entrada.
- Verificação do status ativo do usuário nas rotas protegidas.

## 6. Funcionalidades futuras

Os recursos abaixo fazem parte do planejamento, mas não estão documentados como endpoints implementados:

- Integração com Mercado Pago.
- Checkout e carrinho.
- Confirmação de pagamentos.
- Matrículas e liberação de acesso aos cursos.
- Upload de imagens.
- Planos e assinaturas.
- Filtros avançados de cursos.

## 7. Observações

- Os exemplos de IDs e tokens são ilustrativos.
- Os exemplos de URLs de imagens devem ser substituídos por URLs válidas.
- As respostas podem conter campos adicionais conforme a implementação dos serviços.
- Para testar as rotas administrativas, é necessário utilizar um usuário com perfil `ADMIN` e um JWT válido.