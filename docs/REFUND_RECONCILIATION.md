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
  "executionId": "550e8400-e29b-41d4-a716-446655440000",
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

O módulo está integrado ao executor de reconciliação e gera
alertas operacionais estruturados em JSON.

Os alertas são registrados localmente em stdout ou stderr,
sem envio de notificações externas.

Ainda não existem coleta automática de logs, notificações
externas ou agendamento da reconciliação.

A ausência de um evento final também deverá ser considerada
em um monitoramento futuro, pois pode indicar interrupção
inesperada do processo.

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

### Registros de alertas operacionais

O módulo `src/modules/monitoring/refund-reconciliation.alert.js`
disponibiliza duas funções:

- `criarAlertaReconciliacao`: transforma um evento em um alerta estruturado.
- `registrarAlertaReconciliacao`: registra o alerta em formato JSON.

Os registros possuem os campos:

- `source`: origem do alerta.
- `executionId`: identificador UUID v4 da execução, quando presente no evento de origem.
- `event`: identificador do evento.
- `severity`: INFO, WARNING ou ERROR.
- `requiresAttention`: indica necessidade de acompanhamento.
- `message`: descrição operacional.

Os registros INFO e WARNING são enviados para stdout.

Os registros ERROR são enviados para stderr.

O módulo está integrado ao executor de reconciliação e gera alertas estruturados em JSON. Os alertas são registrados localmente em stdout ou stderr, sem envio de notificações externas.

Os testes estão em:

`tests/refund-reconciliation.alert.test.js`

### Integração dos alertas ao executor

O executor `scripts/reconcile-refunds.js` utiliza o módulo
`refund-reconciliation.alert.js` para gerar alertas operacionais.

Após a finalização da reconciliação e a tentativa de desconexão
do Prisma, o executor registra:

1. O identificador textual do resultado.
2. O evento estruturado em JSON.
3. Um alerta operacional estruturado em JSON.

Cada execução do executor produz um alerta final, classificado como:

- INFO: reconciliação concluída sem erros.
- WARNING: reconciliação ignorada por bloqueio ocupado.
- ERROR: falha de reconciliação, erros individuais ou falha de desconexão.

Os alertas INFO e WARNING são registrados em stdout.
Os alertas ERROR são registrados em stderr.

A emissão do alerta é protegida por tratamento de exceções.
Uma falha no registro do alerta não altera o código de saída
da reconciliação e não provoca uma nova execução financeira.

A tentativa de execução sem autorização continua bloqueada
antes da inicialização do processamento financeiro.

A integração não realiza notificações externas e não
habilita execução automática ou agendamento.

Os testes de integração estão em:

`tests/reconcile-refunds.script.test.js`

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
| Geração de alertas estruturados       | Implementada                 |
| Integração dos alertas ao executor    | Implementada                 |

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

## 16. Identificador único de execução (`executionId`)

Cada chamada ao executor de reconciliação gera um UUID v4 por meio
de `randomUUID()` do Node.js.

O identificador permite correlacionar o evento estruturado com
o alerta operacional da mesma execução.

### Regras

- Cada execução recebe um identificador diferente.
- O evento e o alerta compartilham o mesmo `executionId`.
- O identificador é preservado em conclusões, bloqueios e falhas.
- Registros antigos sem `executionId` continuam compatíveis.
- A identificação não altera o processamento financeiro.
- A autorização continua controlada por `ENABLE_REFUND_RECONCILIATION`.

### Limitações

O identificador não garante persistência ou entrega dos registros.

A detecção de registros duplicados, ausentes ou inconsistentes
será tratada em uma etapa posterior.

Os alertas continuam locais, sem notificações externas.

## 17. Integridade dos registros operacionais

O módulo `src/modules/monitoring/refund-reconciliation.integrity.js` realiza uma análise independente da integridade dos registros operacionais da reconciliação de reembolsos.

A função `analisarIntegridadeReconciliacao(registros)` recebe um array de eventos e alertas, representados por objetos JavaScript ou strings JSON.

A análise é executada exclusivamente em memória, sem consultar o banco de dados, acessar o Mercado Pago ou executar operações financeiras.

### 17.1. Correlação por executionId

Os eventos finais e seus alertas são correlacionados pelo identificador `executionId`, no formato UUID v4.

A análise identifica:

- `DUPLICATE_EVENT`: mais de um evento final com o mesmo identificador.
- `DUPLICATE_ALERT`: mais de um alerta com o mesmo identificador.
- `MISSING_ALERT`: evento final sem alerta correspondente.
- `ORPHAN_ALERT`: alerta sem evento final correspondente.
- `INCONSISTENT_EVENT`: evento incompatível com as regras de classificação operacional.
- `INCONSISTENT_ALERT`: divergência entre os campos do alerta e a classificação esperada para o evento.
- `INVALID_EXECUTION_ID`: identificador presente, mas fora do formato UUID v4.
- `INVALID_RECORD`: registro inválido ou JSON que não pode ser interpretado.
- `UNKNOWN_RECORD`: registro que não corresponde à estrutura reconhecida de evento final ou alerta.

### 17.2. Compatibilidade com registros antigos

Registros anteriores à introdução do `executionId` continuam sendo aceitos como registros legados.

Eventos legados reconhecidos são submetidos à validação de consistência entre `event`, `status` e `exitCode`.

A ausência do identificador impede a correlação segura entre o evento e seu alerta, mas não representa automaticamente uma falha.

### 17.3. Resultado da análise

A função retorna um objeto com:

- `integro`: indica se foram identificados problemas nos registros analisados.
- `totalRegistros`: quantidade de entradas recebidas.
- `totalEventos`: quantidade de identificadores únicos de eventos reconhecidos e correlacionáveis.
- `totalAlertas`: quantidade de identificadores únicos de alertas reconhecidos e correlacionáveis.
- `registrosLegados`: quantidade de registros reconhecidos sem `executionId`.
- `problemas`: lista das inconsistências identificadas, com tipo, identificador e detalhes disponíveis.

O resultado `integro: true` significa apenas que nenhuma inconsistência foi identificada nos registros fornecidos. Não comprova que todos os registros produzidos pelo executor foram coletados.

### 17.4. Limitações

O módulo não realiza coleta automática de logs, agendamento, monitoramento contínuo ou envio de notificações externas.

Uma execução completamente ausente não pode ser identificada apenas pela análise dos registros recebidos. Essa verificação dependerá futuramente de uma referência externa, como um agendamento esperado ou um registro de início.

Registros legados sem `executionId` não podem ser correlacionados com segurança.

### 17.5. Testes automatizados

Os testes estão disponíveis em:

`tests/refund-reconciliation.integrity.test.js`

Eles abrangem correlação, duplicidades, inconsistências, identificadores inválidos, registros legados e entradas malformadas.

A implementação não modifica o processamento financeiro nem exige a ativação da reconciliação.
