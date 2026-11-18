# Reconciliação de reembolsos — Cyludus

## 1. Objetivo

Verificar pagamentos aprovados no Mercado Pago e reconciliar eventuais reembolsos com os registros internos do Cyludus.

A reconciliação é uma operação financeira sensível e deve permanecer desativada até a validação operacional.

## 2. Comando disponível

```powershell
npm run reconcile:refunds
```

O comando utiliza:

- `scripts/run-reconcile-refunds.js`
- `scripts/reconcile-refunds.js`
- `src/modules/payments/payment-refund.reconciliation-batch.js`

## 3. Autorização

Variável de ambiente:

```env
ENABLE_REFUND_RECONCILIATION=false
```

A execução somente é autorizada quando o valor é exatamente `true`.

O ponto de entrada verifica essa variável antes de importar os módulos financeiros.

**Importante:** não habilitar a reconciliação em produção sem autorização operacional e validação prévia.

## 4. Seleção dos pagamentos

São considerados pagamentos com:

- `status = APPROVED`
- `provider = MERCADO_PAGO`
- `providerOrderId` preenchido
- `providerPaymentId` preenchido

O limite padrão é de **100 pagamentos por execução**.

O limite permitido é de **1 a 500 pagamentos**.

As consultas ao banco utilizam lotes de até **50 registros**.

## 5. Controle de concorrência

O processamento utiliza um bloqueio distribuído.

Se outra instância possuir o bloqueio, a execução é interrompida sem processar pagamentos.

O bloqueio é renovado durante o processamento, com:

- Heartbeat a cada 60 segundos.
- Duração solicitada do bloqueio de 300 segundos.
- Verificação da validade do bloqueio durante o processamento.

O sistema tenta liberar o bloqueio ao finalizar.

## 6. Cursor de processamento

O sistema mantém um cursor persistido para acompanhar o progresso entre execuções.

Após processar cada pagamento, o cursor é atualizado.

Quando a consulta não encontra mais registros elegíveis, o cursor é reiniciado.

O cursor permite continuar a varredura dos pagamentos entre execuções.

**Atenção:** o cursor registra o avanço da varredura, não garante que um pagamento com erro será automaticamente reprocessado na execução seguinte.

## 7. Resultado da reconciliação

O resumo contém:

| Campo            | Descrição                                       |
| ---------------- | ----------------------------------------------- |
| `verificados`    | Pagamentos analisados                           |
| `reembolsados`   | Pagamentos reconciliados                        |
| `semReembolso`   | Pagamentos sem reembolso identificado           |
| `naoConfirmados` | Reembolsos não totalmente confirmados           |
| `erros`          | Falhas individuais ou resultados inesperados    |
| `bloqueado`      | Indica quando outra instância possui o bloqueio |

O campo `bloqueado` aparece quando a execução não consegue adquirir o bloqueio.

## 8. Códigos de saída

### Código 0

- Processamento concluído sem erros contabilizados.
- Execução não realizada porque outra instância possui o bloqueio.

### Código 1

- Autorização ausente.
- Erros contabilizados no processamento.
- Falha geral de reconciliação.
- Falha ao desconectar o Prisma.

**Importante:** código `0` não significa necessariamente que algum pagamento tenha sido processado.

### Identificadores de observabilidade

O executor registra um identificador ao finalizar a execução, permitindo diferenciar os resultados nos logs.

| Identificador                          | Significado                                                | Código de saída |
| -------------------------------------- | ---------------------------------------------------------- | --------------- |
| `REFUND_RECONCILIATION_COMPLETED`      | Reconciliação concluída sem erros contabilizados           | `0`             |
| `REFUND_RECONCILIATION_SKIPPED_LOCKED` | Execução ignorada porque outra instância possui o bloqueio | `0`             |
| `REFUND_RECONCILIATION_FAILED`         | Falha no processamento ou na desconexão do Prisma          | `1`             |

Esses identificadores podem ser utilizados futuramente para monitoramento e alertas.

**Importante:** uma execução ignorada por bloqueio não deve ser interpretada como processamento concluído.

O identificador `REFUND_RECONCILIATION_FAILED` também é registrado quando a execução apresenta erros individuais, mesmo que outros pagamentos tenham sido processados com sucesso.

A ausência de um identificador final pode indicar que o processo foi interrompido antes de concluir a execução.

### Logs estruturados em JSON

Além das mensagens textuais, o executor registra um evento estruturado
ao finalizar a execução.

Exemplo:

```json
{
  "event": "REFUND_RECONCILIATION_COMPLETED",
  "status": "SUCCESS",
  "exitCode": 0,
  "timestamp": "2026-11-16T21:30:00.000Z",
  "summary": {
    "verificados": 5,
    "reembolsados": 2,
    "semReembolso": 3,
    "naoConfirmados": 0,
    "erros": 0
  }
}
```

O timestamp acima é ilustrativo. O executor utiliza a data e hora
reais da execução, em formato ISO 8601 UTC.

Os status possíveis são:

- `SUCCESS`: processamento concluído sem erros.
- `SKIPPED`: execução ignorada por bloqueio distribuído.
- `FAILED`: processamento ou desconexão com falha.

O campo `summary` contém contadores operacionais. Quando a reconciliação
lança uma exceção antes de retornar um resumo, seu valor é `null`.

Os eventos estruturados são registrados em stdout quando o código de
saída é `0` e em stderr quando o código de saída é `1`.

A execução não autorizada é bloqueada antes do carregamento do
executor financeiro e não gera esse evento estruturado.

### Monitoramento futuro

Os eventos JSON poderão ser utilizados por ferramentas de monitoramento
para identificar falhas e execuções ignoradas por bloqueio.

Ainda não existem alertas automáticos nem agendamento da reconciliação.
A ausência de um evento final também deverá ser considerada em um
monitoramento futuro, pois pode indicar interrupção inesperada do processo.

## 9. Tratamento de falhas

Falhas individuais são registradas e contabilizadas.

Falhas gerais interrompem a execução.

O sistema tenta liberar o bloqueio e desconectar o Prisma durante a finalização.

A perda do bloqueio pode interromper o processamento.

A recuperação de falhas e o reprocessamento de pagamentos devem ser validados antes de qualquer agendamento automático.

## 10. Segurança operacional

- Não compartilhar credenciais do banco ou Mercado Pago.
- Não registrar tokens ou segredos nos logs.
- Manter a autorização desativada por padrão.
- Não executar operações financeiras reais durante testes.
- Não iniciar múltiplas execuções manualmente.
- Investigar erros antes de repetir operações.
- Não considerar testes unitários suficientes para liberar o uso em produção.
- Não habilitar agendamentos sem monitoramento e procedimento de recuperação.

## 11. Testes automatizados

Os testes relevantes incluem:

- `tests/reconcile-refunds.script.test.js`
- `tests/run-reconcile-refunds.test.js`
- Testes do processamento em lote.
- Testes do cursor e bloqueio distribuído.
- Testes da reconciliação individual.

Para executar todos os testes:

```powershell
npm test
```

Os testes automatizados utilizam simulações e não substituem uma validação operacional controlada.

## 12. Agendamento futuro

Ainda não há agendamento automático configurado.

Antes de implementar um agendador, definir:

- Ambiente de execução.
- Frequência de processamento.
- Responsável operacional.
- Monitoramento e alertas.
- Política de repetição após falhas.
- Comportamento quando o bloqueio estiver ocupado.
- Procedimento de desativação emergencial.
- Validação com dados e credenciais de teste.

## 13. Monitoramento operacional dos eventos

O módulo `src/modules/monitoring/refund-reconciliation.monitor.js`
disponibiliza a função `classificarEventoReconciliacao`.

Ela recebe um objeto ou uma string JSON com o resultado da
reconciliação e retorna uma classificação operacional.

### Classificações

| Evento                               | Gravidade | Requer atenção |
| ------------------------------------ | --------- | -------------- |
| REFUND_RECONCILIATION_COMPLETED      | INFO      | Não            |
| REFUND_RECONCILIATION_SKIPPED_LOCKED | WARNING   | Sim            |
| REFUND_RECONCILIATION_FAILED         | ERROR     | Sim            |
| Evento inválido ou desconhecido      | ERROR     | Sim            |

O classificador verifica a compatibilidade entre o evento,
o status e o código de saída.

### Orientações operacionais

**INFO:** registrar a conclusão da execução.

**WARNING:** verificar se existe outra reconciliação em andamento.
O bloqueio ocupado não significa necessariamente uma falha.

**ERROR:** investigar a causa antes de considerar uma nova execução.

Eventos inválidos ou contraditórios exigem investigação e não
devem ser interpretados como sucesso.

### Limitações atuais

O módulo apenas classifica eventos recebidos.

Ainda não existem:

- Coleta automática de logs.
- Notificações externas.
- Agendamento da reconciliação.
- Detecção automática de ausência de execução.
- Integração com plataformas de monitoramento.

A reconciliação deve permanecer desativada até a conclusão das
validações operacionais necessárias.

### Testes

O classificador possui testes automatizados em:

`tests/refund-reconciliation.monitor.test.js`

Para executá-los:

```powershell
npx vitest run tests/refund-reconciliation.monitor.test.js
```

## 14. Estado atual

| Funcionalidade                        | Situação                     |
| ------------------------------------- | ---------------------------- |
| Executor manual                       | Implementado                 |
| Proteção por variável de ambiente     | Implementada                 |
| Bloqueio distribuído                  | Implementado                 |
| Cursor persistido                     | Implementado                 |
| Testes automatizados                  | Aprovados na última execução |
| Execução financeira real              | Não validada                 |
| Agendamento automático                | Não implementado             |
| Classificação de eventos operacionais | Implementada                 |
| Coleta automática de logs             | Não implementada             |
| Alertas automáticos                   | Não implementados            |

## 15. Recomendações para produção

Antes de liberar a reconciliação em produção:

1. Validar o fluxo em ambiente de testes.
2. Confirmar a configuração das credenciais.
3. Revisar os mecanismos de bloqueio e cursor.
4. Implementar monitoramento e alertas.
5. Definir uma política segura de recuperação de falhas.
6. Validar o comportamento diante de interrupções inesperadas.
7. Documentar os responsáveis pela operação.
8. Obter autorização para habilitar a execução.

**A reconciliação deve permanecer desativada até a conclusão dessas verificações.**
