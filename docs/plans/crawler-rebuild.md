# Plano de reconstrução da coleta própria

## Objetivo e premissas

Entregar preços reais de Smiles em pontos, Azul em pontos e LATAM em BRL, obtidos diretamente dos fluxos públicos das companhias, sem login de passageiro e sem fornecedor de dados. O escopo inicial é PET→CGH, PET→VCP e PET→GRU, respectivamente, ida, um adulto, econômica, com janela futura de 45 dias.

Este plano resulta da [pesquisa sobre coleta aérea](../research/airline-crawlers-sota.md), consultada em 11/09/2026. Todas as tarefas estão pendentes. Novos comandos, módulos, endpoints e tabelas descritos abaixo são propostas a implementar, não recursos já disponíveis.

Começar por uma busca real verificável. A escolha do transporte e do ambiente de execução depende dessa evidência. O frontend e a API permanecem no Cloudflare; um runner próprio Node.js pode executar a coleta separadamente. Não contratar serviços nem criar infraestrutura paga como parte da descoberta local.

GOL cash e Azul cash serão extensões posteriores. LATAM Pass, perfis de clube, automação de login e emissão de passagens não são requisitos desta entrega. Uma restrição de acesso descoberta não autoriza ampliar silenciosamente o escopo para contas autenticadas.

## Sequência e critérios de passagem

| Bloco       | Tarefas | Resultado necessário para avançar                                                       |
| ----------- | ------- | --------------------------------------------------------------------------------------- |
| Evidência   | C01–C05 | Conhecer o fluxo público real de cada fonte e seus limites.                             |
| Adaptadores | C06–C09 | Busca automatizada com dados reais, parser validado e falhas explícitas.                |
| Operação    | C10–C13 | Execução repetível, jobs recuperáveis, dados com idade correta e diagnóstico por fonte. |
| Liberação   | C14–C15 | Piloto aprovado por fonte e promoção gradual para produção.                             |

Uma fonte pode avançar independentemente das outras. LATAM cash é a primeira candidata por ter uma única modalidade no escopo, não por haver evidência de ser menos protegida. Se outra fonte apresentar primeiro um caminho público estável, priorizá-la e registrar a decisão. A entrega completa continua exigindo as três fontes.

## C01 — Registrar baseline e limitar a próxima execução

**Dependência:** nenhuma.

Criar um registro sanitizado do run `34d7cbe4-88d0-4427-ac49-9837191b5516`, contendo contagens, horários, fonte, classe do erro e versão do código. Implementar seleção explícita de fonte, rota e data para testes locais, sem gravação em produção por padrão. O modo de diagnóstico deve informar seu alvo e seu orçamento máximo antes de executar.

Reaproveitar a lógica do probe já existente em `workers/src/api/probe.ts`: ele consulta uma rota/data por programa em staging, mas ainda pode executar modalidades associadas conforme as flags. Evoluir para seleção de uma fonte específica e compartilhar essa lógica com a CLI, sem duplicar os coletores.

**Aceite:** é possível testar uma única fonte/data sem disparar 45 dias ou as modalidades associadas; nenhum token, cookie, IP de cliente ou payload pessoal aparece no relatório. Um modo de simulação não é rotulado como live.

**Arquivos prováveis:** `workers/src/api/probe.ts`, `workers/src/scheduler.ts`, `workers/src/collectors/capabilities.ts`, nova CLI em `scripts/` e registro em `docs/research/`.

## C02 — Criar ferramenta local de descoberta

**Dependência:** C01.

Criar uma ferramenta mínima em TypeScript com Playwright para acompanhar uma busca pública. Permitir navegador visível para diagnóstico, prazo máximo, captura da resposta ligada aos parâmetros da busca e evidência visual do resultado. A ferramenta não precisa saber todos os schemas das companhias de antemão.

Salvar um manifesto com fonte, data/hora, rota, data de voo, passageiros, cabine, modalidade, URL pública, versão da ferramenta e resultado. Guardar exemplos sanitizados de sucesso e falha; remover valores de headers de autenticação e cookies antes de versionar qualquer artefato. Dados temporários de sessão ficam fora do Git.

**Aceite:** um artefato permite rastrear o preço observado até a resposta e a tela correspondentes; a ferramenta identifica conclusão, erro e timeout; não confunde resposta de calendário ou requisição anterior com a busca atual. O prazo é aplicado também ao corpo da resposta.

**Entrega:** ferramenta local e template `docs/research/contracts/<fonte>.md`.

## C03 — Descobrir o contrato público da LATAM cash

**Dependência:** C02.

Executar manualmente o fluxo público de ida em BRL para PET→GRU e documentar três datas com comportamento conhecido. Registrar sessão inicial, chamadas necessárias, identificadores, oferta final, marca tarifária, segmentos e inclusão de taxas. Comparar os endpoints encontrados com `latam-pass/client.ts`; não presumir que o caminho atual esteja correto.

Determinar como o site indica término e ausência real de opções. Se PET não tiver oferta nas datas escolhidas, utilizar uma rota de controle para diagnóstico, sem declarar que PET foi validada. Testar o fluxo sem credenciais e com um contexto novo.

**Aceite:** ao menos uma oferta real de PET→GRU com valor total em BRL confrontado com a interface, ou um impedimento reproduzível documentado que bloqueie a implementação live desta fonte. O contrato identifica campos monetários e suas unidades; respostas vazias ou incompletas não são exemplos positivos.

## C04 — Descobrir o contrato público do Smiles

**Dependência:** C02; pode ser executada independentemente de C03.

Documentar a pesquisa de PET→CGH e distinguir tarifa pública padrão, clube/elite e pontos mais dinheiro. Confirmar o papel do `SMILES_API_KEY` no fluxo observado; a existência da variável não demonstra que a chave está válida nem que seja suficiente para pesquisar.

Registrar os campos de programa de emissão, companhia operadora, número de voo, pontos, taxas, copagamento e elegibilidade. Não transportar uma sessão Smiles para o site GOL. GOL cash não é parte desta tarefa.

**Aceite:** oferta pública real da rota confrontada com a tela, ou impedimento reproduzível documentado; contrato distingue pontos de preço em BRL e tarifa padrão de tarifa restrita. Benefício de clube não aparece como tarifa acessível a todos.

## C05 — Descobrir o contrato público da Azul em pontos

**Dependência:** C02; pode ser executada independentemente de C03/C04.

Identificar o fluxo atual da Azul para consultar pontos sem login. Verificar se o calendário e a tela de ofertas usam contratos distintos; seguir a busca até a oferta detalhada quando disponível. Não assumir que basta trocar `pricingMode` em um endpoint de dinheiro.

Validar PET→VCP, inclusive conexões quando existirem. Registrar pontos, eventual copagamento, taxas, elegibilidade e diferenças entre valor indicativo e oferta detalhada. Datas e grade operacional devem vir da consulta atual, não de constantes antigas do código.

**Aceite:** oferta real da rota validada na interface, ou impedimento reproduzível documentado; conexão não vira voo direto; valor de calendário não vira oferta confirmada; ausência de tarifa pública é registrada como restrição, não preenchida com fixture.

## C06 — Definir resultado comum e validação de contrato

**Dependência:** C02 e pelo menos um contrato real de C03–C05. Incorporar as outras fontes à medida que forem validadas.

Separar requisição de busca, observação e oferta. A chave da pesquisa inclui fonte, aeroportos exatos, data local, passageiros, cabine, modalidade e perfil público. Versionar o contrato/parser. Separar `started_at`, `observed_at` e `persisted_at`.

Adotar resultados explícitos: `success`, `empty_confirmed`, `filtered_out`, `access_blocked`, `session_expired`, `rate_limited`, `upstream_error`, `contract_changed`, `timeout` e `unsupported`. Ajustar os nomes à tipagem existente sem perder as distinções. `empty_confirmed` exige resposta reconhecida e busca concluída; payload inesperado e itens descartados pelo parser não satisfazem esse requisito.

Ofertas preservam itinerário, fonte, programa de emissão quando aplicável, cabine, perfil de elegibilidade, pontos, moeda e componentes monetários conhecidos. Usar centavos ou decimal exato para dinheiro; manter taxas desconhecidas como `null`, não zero. A comparação “menor pontos” não pode priorizar silenciosamente uma oferta com grande copagamento como equivalente a pontos puros.

**Aceite:** testes com capturas reais sanitizadas e casos de regressão cobrem JSON inesperado, corpo vazio, HTML de bloqueio com HTTP 200, rota/data divergente, moeda diferente, ausência confirmada e modalidade mista. Um payload válido apenas sintaticamente não passa como oferta.

## C07 — Implementar o adaptador LATAM cash

**Dependências:** C03 aprovada e C06.

Implementar o fluxo observado, inicialmente no transporte que demonstrou funcionar. Se usar navegador, executar a navegação necessária e ler a resposta da busca. Extrair o parser para módulo independente do runtime e manter o adaptador fino.

Implementar criação, reutilização e encerramento de sessão pública, deadline por tentativa e erro estruturado. Avaliar HTTP como otimização somente se a mesma busca continuar válida e repetível; documentar o transporte escolhido.

**Aceite:** três datas reais, sessão nova e reutilizada, preço BRL e itinerário confrontados com a interface; nenhuma escrita de fixtures no caminho live. Teste local isolado reproduz o resultado ou uma falha bem classificada.

## C08 — Implementar o adaptador Smiles público

**Dependências:** C04 aprovada e C06.

Implementar busca e normalização conforme o contrato público capturado. Preservar identificação da tarifa e não habilitar clube por simples presença de uma sessão pública. Criar um ciclo de sessão próprio do Smiles; leitura de pontos e taxas não depende da disponibilidade de GOL cash.

**Aceite:** mesmos critérios de repetibilidade da C07, incluindo distinção entre tarifa padrão, clube e pontos mais dinheiro. Falha do Smiles não executa automaticamente outro programa nem muda o perfil de elegibilidade.

## C09 — Implementar o adaptador Azul público em pontos

**Dependências:** C05 aprovada e C06.

Implementar o fluxo de pontos comprovado, incluindo passagem de calendário para oferta quando necessária. Preservar segmentos, aeroporto final, pontos e componentes monetários. O comportamento live não depende da função que troca datas de fixtures.

**Aceite:** mesmos critérios de repetibilidade da C07; ponto de conexão, número de paradas e modalidade batem com a tela; calendário indicativo e oferta detalhada permanecem distinguíveis. Cobertura de parceiros não é confundida com oferta Azul doméstica.

## C10 — Validar repetibilidade e escolher o ambiente

**Dependência:** pelo menos um adaptador C07–C09 funcional. Repetir por fonte.

Comparar a busca pública manual, a automação local e o ambiente candidato a produção, mantendo parâmetros equivalentes. Avaliar navegador próprio em Node.js e, se útil, Browser Run como opção de hospedagem; não pressupor equivalência de acesso. Medir sessão nova/reutilizada, tempo, memória, bytes, taxa de sucesso e expiração.

Produzir decisão curta com o transporte e ambiente por fonte, custo de infraestrutura estimado a partir das medições e procedimento de atualização do navegador. Uma execução local positiva não libera produção. Não contratar uma nova hospedagem durante esta tarefa sem decisão concreta de custo e implantação.

**Aceite:** relatório reproduzível identifica o que funciona, onde e com quais limites. O piloto deve incluir pelo menos 30 buscas por fonte distribuídas em três dias e atingir os critérios definidos em C14. Até completar esse período, a fonte permanece experimental.

## C11 — Persistir jobs e resultados por unidade de busca

**Dependências:** C06 e ao menos um adaptador funcional. Consolidar o executor escolhido em C10 antes da liberação.

Adicionar tabela de jobs no Supabase, claim atômico, lease com expiração e número limitado de tentativas. O runner próprio consulta uma API interna do Worker com token dedicado, diferente de leitura e disparo. A chave administrativa do Supabase fica apenas no Worker.

Persistir observação, ofertas e conclusão do job em operação transacional. Reentrega do mesmo resultado é idempotente; uma nova atualização periódica tem identidade própria. Validar origem/fonte/data e tamanho do resultado recebido, bem como posse e vigência do lease. Uma conclusão antiga não substitui uma observação mais recente.

Aplicar limites compartilhados por fonte: um job em execução inicialmente; orçamento de buscas; deadline; retries apenas para motivos transitórios. Respeitar `Retry-After`, reagendando se necessário. Bloqueio persistente abre o circuito da fonte e evita repetir o restante da janela; uma tentativa controlada posterior verifica recuperação.

**Aceite:** testes de integração cobrem concorrência no claim, processo interrompido, expiração de lease, entrega duplicada, resultado fora de ordem, falha durante persistência e 429 com espera longa. Uma fonte interrompida não impede as demais. Não existem duas filas duráveis concorrentes para o mesmo trabalho.

## C12 — Expor atualização, ausência e procedência na leitura

**Dependência:** C11.

Evoluir o modelo de leitura com observações por pesquisa, inclusive buscas válidas sem ofertas. A última busca válida vazia invalida a oferta antiga na visão atual da mesma chave, preservando histórico. Falha de atualização preserva a última oferta conhecida apenas com estado de desatualização e horário original.

Separar `last_attempt_at`, `last_success_at` e `observed_at`; não escolher o menor valor entre coletas históricas como se fosse preço atual. Manter resultados por itinerário antes de calcular mínimos diários. Tarifas de voos diferentes podem compor indicadores separados, mas não uma comparação de valor por ponto do mesmo bilhete.

**Aceite:** cenários completos cobrem oferta→ausência confirmada, oferta→bloqueio, ausência→oferta e duas ofertas de itinerários distintos. O frontend diferencia “sem disponibilidade”, “não foi possível atualizar” e “última consulta há…”. Dados de teste não entram em leitura live.

**Migração:** criar nova migration compatível com schema já implantado; verificar nomes e ordem das colunas das views para evitar repetir o erro `42P16`. Preservar histórico e testar a atualização sobre uma cópia representativa do schema, além de banco vazio.

## C13 — Observabilidade por fonte e contrato

**Dependências:** C06; integrar com C11 quando disponível.

Registrar início/fim de job, duração, resultado, quantidade de ofertas extraídas/gravadas, versão do contrato, ambiente, motivo de retry e abertura/fechamento de circuito. Agregar Sentry por fonte e classe de erro, com amostra representativa de cada fonte. Distinguir sucesso do runtime, sucesso de coleta e sucesso de persistência.

Capturas de falha devem ser sanitizadas e privadas; Sentry recebe identificador e resumo, não cookies, headers de autorização ou corpo bruto irrestrito. Corrigir textos que atribuam a falha ao IP ou à ausência de login sem comprovação.

**Aceite:** é possível localizar uma execução e explicar o resultado de cada fonte sem repetir a coleta inteira. Uma alteração de contrato ou sequência de bloqueios aparece como problema da fonte correspondente. Sucesso inclui métricas próprias e não é deduzido da ausência de eventos de erro.

## C14 — Executar piloto de qualidade e ampliar a janela

**Dependências:** C10–C13 e adaptador da fonte avaliada.

Começar em staging com sete datas e limites conservadores, distribuindo execuções ao longo de pelo menos três dias. Cobrir pelo menos 30 buscas por fonte e comparar dez ofertas de cada uma com o site em horário próximo e parâmetros equivalentes. Os resultados de C10 podem compor a amostra quando configuração e versão forem as mesmas.

**Metas iniciais:** pelo menos 95% de buscas válidas, contando ausência apenas quando confirmada; nenhuma divergência não explicada de preço nas ofertas revisadas; nenhuma confusão de pontos/dinheiro, rota, cabine ou elegibilidade; horários corretos; nenhuma fixture live. Medir também idade e cobertura: contar muitos vazios não comprova cobertura de inventário.

Ampliar cada fonte aprovada de sete para 45 dias. Verificar duração, consumo e comportamento de circuito. A busca de calendário, se adotada, deve manter a distinção entre indicação de preço e oferta detalhada. As metas não representam SLA e devem ser reavaliadas com uma amostra maior.

**Aceite:** relatório por fonte com parâmetros, versão, contagens, divergências e amostras verificadas. Fonte reprovada permanece experimental e tem próxima hipótese específica; não repetir a janela completa indefinidamente.

## C15 — Liberar produção gradualmente e documentar operação

**Dependência:** C14 aprovada por fonte.

Promover uma fonte por vez, com flags independentes e possibilidade de desativação. O cron apenas agenda o trabalho; não concentra toda a coleta em uma requisição longa. Adotar inicialmente duas atualizações diárias se os testes sustentarem esse volume, com idade exibida na interface; ajustar frequência por evidência e necessidade.

Verificar preço real na interface pública, rastreável ao job e à fonte. Acompanhar o primeiro ciclo agendado e registrar o comportamento durante falha de uma fonte. Documentar como executar uma busca isolada, revisar uma captura, atualizar um contrato e recuperar jobs.

**Aceite final:** Smiles público em pontos, Azul público em pontos e LATAM cash em BRL operando nas rotas do produto, com ofertas reais quando disponíveis, ausência confirmada quando não houver inventário, idade visível, falhas isoladas e nenhum dado sintético. Login não é requisito de consulta. A pesquisa sozinha não satisfaz este aceite.

## Extensões depois do MVP

Adicionar GOL cash e Azul cash como capacidades independentes, aplicando descoberta, contrato, piloto e liberação a cada uma. Só depois avaliar atualização sob demanda, frequência baseada em interesse e alertas. Se houver atualização pública sob demanda, ela precisa de deduplicação, limites de uso e orçamento por fonte; a chave de leitura exposta ao frontend não concede permissão irrestrita de coleta.

## Orientação para execução por outro modelo

Executar uma tarefa por mudança revisável, preservando as edições existentes da branch. Registrar evidência de aceite e atualizar o estado da tarefa quando concluída. Não substituir uma tarefa bloqueada por dados sintéticos, endpoint presumido, captura de outra rota ou contratação de fornecedor.

Para tarefas com rede, começar pela seleção mínima de fonte/data. Testes de parser usam fixtures sanitizadas e não chamam companhias no CI. Testes live são explícitos, limitados e separados dos testes determinísticos. Não afirmar que uma fonte está pronta porque unit tests passaram ou o Worker retornou HTTP 200.

As conclusões documentais e suas fontes estão no [estudo](../research/airline-crawlers-sota.md). Os critérios numéricos, nomes de módulos e arquitetura deste plano são propostas para o projeto, não funcionalidades atribuídas aos produtos pesquisados.
