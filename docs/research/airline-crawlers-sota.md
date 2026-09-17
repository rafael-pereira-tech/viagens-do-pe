# Coleta própria de tarifas aéreas: pesquisa e arquitetura

## Decisão recomendada

Construir uma coleta própria, com adaptadores independentes para Smiles, Azul e LATAM, descoberta dos contratos pelo fluxo público real e validação de preço contra a interface da companhia. Usar um navegador controlado na descoberta; escolher entre HTTP e execução no navegador conforme evidência de funcionamento de cada fonte. Manter Cloudflare como aplicação e coordenador, permitindo que os coletores executem em um processo Node.js separado.

O padrão aproveitável de Seats.aero, Roame e AwardFares é a combinação de consultas específicas, dados previamente coletados, atualização seletiva e tratamento explícito de falhas e de dados antigos. Suas documentações não revelam uma implementação completa dos mecanismos de coleta. Não há base para afirmar que utilizam determinada biblioteca, infraestrutura, rede de proxies ou solução de CAPTCHA.

Esta proposta segue a decisão de usar **somente coleta própria, sem fornecedor de dados**. Hospedagem de código próprio é uma decisão de infraestrutura separada, ainda sem contratação ou orçamento aprovado. O [plano de implementação](../plans/crawler-rebuild.md) transforma as conclusões em entregas verificáveis.

## Escopo e qualidade da evidência

A consulta às fontes foi realizada em 11/09/2026. O objetivo inicial é uma passagem de ida, um adulto, econômica, mercado brasileiro, consulta pública sem login de passageiro: Smiles em pontos para PET→CGH, Azul em pontos para PET→VCP e LATAM em BRL para PET→GRU. GOL e Azul em dinheiro continuam como extensão posterior; LATAM Pass, benefícios de clube e sessões de membros ficam fora da primeira entrega.

As conclusões distinguem três tipos de evidência: documentação pública dos próprios produtos; comportamento observado no nosso run e no código; e recomendações de engenharia que precisam ser testadas. Documentação comercial comprova o que um serviço declara oferecer, não a taxa de acerto nas nossas rotas. Este estudo não executou novas buscas nas companhias nem validou seus contratos atuais em um navegador.

O código consultado está no commit local `5d731c9`; os coletores e o scheduler não diferem de `origin/main` em `862db27`. A integração Sentry foi consultada em `origin/main`. A pesquisa não alterou execução, agendamento ou configuração de produção.

## O que os produtos de referência documentam

| Produto    | Comportamento documentado                                                                                                              | Consequência para o nosso projeto                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Seats.aero | Explore e grande parte de Search usam dados coletados previamente; buscas ao vivo dependem de programa e amplitude da consulta.        | Separar cobertura do cache, resultado da busca e saúde da fonte. [1]                    |
| Roame      | SkyView pesquisa rotas predefinidas diariamente e incorpora rotas de alertas; mantém resultados com indicação de quando foram vistos.  | Priorizar rotas relevantes e tornar a idade de cada observação visível. [2]             |
| AwardFares | A visão de calendário pode começar com dados recentes em cache; atualizar datas dispara buscas ao vivo.                                | Uma janela de calendário não precisa disparar toda a coleta ao abrir a página. [3]      |
| point.me   | Declara que a busca pode levar cerca de dois minutos e verifica disponibilidade várias vezes para eliminar resultados não reserváveis. | Latência e validação têm custo; uma resposta rápida não comprova oferta válida. [4]     |
| Skyscanner | Distingue preços indicativos de consultas live feitas a parceiros de inventário.                                                       | Preço indicativo, oferta consultada e confirmação de compra são estados diferentes. [5] |

### Seats.aero: o que sabemos e o que permanece fechado

A API documenta fontes por programa de fidelidade, incluindo `smiles` e `azul`, além de objetos resumidos por rota/data e detalhes de itinerários. Campos como número de assentos não estão disponíveis para todas as fontes. Essa modelagem é útil: programa de emissão, companhia operadora, itinerário e oferta são entidades diferentes. A lista de fontes, entretanto, não comprova cobertura de PET nem equivalência com a tarifa doméstica pública da Azul. [6]

A API live documenta consultas por origem, destino e data, duração esperada de 5–15 segundos, possibilidade de falha e fallback opcional para cache identificado como tal. Também aplica filtros de preço dinâmico por padrão. Copiar esses filtros seria inadequado para um calendário cujo objetivo é mostrar as tarifas públicas encontradas, inclusive caras. O tempo publicado é uma característica declarada desse serviço, não uma estimativa para o nosso scraper. [7]

O acesso pessoal à API e o uso comercial têm condições diferentes; a documentação exige acordo para uso comercial e para a API live. Não será uma dependência do produto, conforme a decisão de coleta própria. [7][8]

Há uma evidência histórica direta sobre acesso sem login: em outubro de 2023, Ian Carroll, identificado como representante verificado do Seats.aero, afirmou que a coleta de Qantas e Air Canada não utilizava login. A declaração vale para esses sites e para aquele momento; não permite extrapolar para Smiles, Azul ou a operação atual inteira. [9]

Não encontramos documentação primária suficiente para reconstruir a infraestrutura interna atual do Seats.aero. Alegações de que bastaria copiar um conjunto de headers, usar Playwright ou mudar o IP permanecem hipóteses, não uma descrição comprovada de sua arquitetura.

### Atualização e falhas fazem parte do produto

Roame documenta que alertas podem aproveitar tanto buscas programadas quanto buscas live de outros usuários. Isso mostra como uma consulta pode alimentar outras experiências sem repetir a mesma busca para cada visitante. [10]

Seats.aero mantém status por programa e explica que falhas em consultas live não interrompem necessariamente a consulta aos dados em cache. O status é volátil: a pesquisa encontrou diferença entre resultado indexado e página aberta. Não deve ser interpretado como garantia de disponibilidade futura. [11]

Nem acesso direto garante reserva: a documentação sobre disponibilidade fantasma descreve defasagem entre inventários, cache e informações de parceiros. Para o nosso MVP, a garantia implementável é “oferta observada neste canal, para estes parâmetros, neste horário”, acompanhada de link para nova consulta na companhia. Não prometemos emissão nem preço reservado. [12]

## O estado da arte aplicável à coleta própria

### 1. Descobrir a busca, não apenas os links do site

Nosso domínio é uma matriz finita de pesquisas: fonte × origem × destino × data × passageiros × cabine × modalidade. Um crawler genérico que percorre hyperlinks não descobre necessariamente o inventário calculado após envio de formulários e chamadas de API.

A documentação do Scrapy recomenda localizar a origem dos dados dinâmicos e reproduzir a requisição correspondente; se isso não for viável, considerar um navegador. A recomendação para este projeto é registrar primeiro uma busca bem-sucedida e entender como a resposta se relaciona ao preço visível. [13]

O protocolo de descoberta deve registrar: página inicial, sequência de navegação, método e caminho da busca, corpo e parâmetros, nomes dos headers relevantes, criação e expiração da sessão pública, formato do resultado, condições de término e evidência visual. Endpoints presentes no nosso código são candidatos a verificar, não contratos confirmados.

### 2. Separar sessão pública de conta de fidelidade

“Sem login” descreve a ausência de autenticação do passageiro. Não comprova que o site dispense cookies temporários, contexto de navegação, inicialização de sessão ou parâmetros emitidos pelo próprio frontend.

Playwright permite observar requests e responses, inclusive XHR/fetch. Isso viabiliza executar o fluxo normal e extrair o JSON produzido pela busca, com menor dependência dos seletores de preço do DOM. A espera deve estar ligada à resposta e ao estado final daquela pesquisa, não a um atraso arbitrário. [14]

O `APIRequestContext` associado a um contexto do Playwright compartilha seu armazenamento de cookies. Isso não constitui uma promessa de que requisições HTTP desse cliente sejam equivalentes às feitas pelo mecanismo de rede do navegador. A migração para HTTP precisa de teste próprio; compartilhar cookies, isoladamente, não é critério de aprovação. [15]

Cada companhia deve ter sua própria sessão. Dados de sessão do Smiles não devem ser tratados como sessão do site GOL. O MVP deve criar e renovar sessões públicas pelo fluxo observado, sem depender de copiar credenciais ou cookies de uma sessão pessoal existente.

### 3. Escolher ferramentas pela função

| Abordagem                                   | Papel adequado                                                                              | Limitação a testar                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| HTTP com parser determinístico              | Coleta mais simples quando o contrato público funciona nesse cliente.                       | Não executa o frontend nem cria automaticamente seu contexto.                         |
| Playwright com captura da resposta da busca | Descoberta e operação de fluxos dependentes de navegador.                                   | Maior custo de memória/tempo; execução automatizada pode ser bloqueada.               |
| Extração do DOM                             | Alternativa quando a informação verificável só está disponível na interface.                | Layout, localização e carregamento parcial afetam seletores e leitura.                |
| Crawlee sobre Playwright                    | Gestão de execução, sessões, limites e estatísticas quando os adaptadores já funcionam.     | Não corrige um contrato errado; seus retries precisam respeitar a política por fonte. |
| Scrapy                                      | Alternativa madura para uma equipe que já trabalhe em Python e tenha predominância de HTTP. | Introduzir outro runtime não demonstra melhoria para estas três fontes.               |

Crawlee documenta `PlaywrightCrawler`, filas de requests, controle de concorrência, estatísticas e gerenciamento de sessões. Esses componentes ajudam a operar os adaptadores; não substituem a lógica de domínio. Para o primeiro experimento, Playwright com uma CLI pequena é suficiente. Avaliar Crawlee depois evita manter duas filas duráveis ou camadas de retry sobrepostas. [16][17]

A escolha inicial recomendada é TypeScript/Node.js, aproveitando a base existente e isolando os parsers de Workers e navegador. LLMs podem auxiliar a análise de contratos e manutenção, mas não devem inferir preços, completar campos ausentes ou decidir silenciosamente que uma página contém uma oferta. Isso é uma decisão de determinismo e auditabilidade, não uma alegação sobre a tecnologia dos concorrentes.

### 4. Identificar a camada que falhou

Akamai documenta detecção por comportamento, características do navegador e anomalias de HTTP. Portanto, um User-Agent de Chrome não basta para estabelecer equivalência com uma visita real. O material público não revela qual regra produziu os nossos erros; os HTTP 403/406 observados não distinguem sozinhos sessão, contrato, região ou política de automação. [18]

O experimento necessário compara, com parâmetros equivalentes: navegação pública manual, execução automatizada do mesmo fluxo, cliente HTTP quando aplicável e ambiente candidato à produção. Se manual e automação falham, a evidência é diferente de manual funcionar e HTTP falhar. Alterar várias dimensões ao mesmo tempo impede descobrir a causa.

Um ambiente com navegador gerenciado também não garante acesso. A documentação do Cloudflare Browser Run, antigo Browser Rendering, afirma que o tráfego se origina da rede Cloudflare, inclui identificação própria e é reconhecido como bot pelo Bot Management da Cloudflare. A documentação do endpoint `/crawl` informa que ele não supera CAPTCHA ou detecção de bots. São limitações do produto, não prova de que a Akamai bloqueará toda sessão desse serviço. [19][20]

Consequentemente, não há fundamento para migrar cegamente os três coletores para Browser Run ou assumir que uma VPS resolverá. A decisão de hospedagem vem depois do teste de repetibilidade. Se o fluxo impuser login, desafio ou recusa persistente, isso deve aparecer como restrição da fonte e interromper a coleta automática correspondente, não como inventário vazio.

### 5. Agendamento proporcional à necessidade

A documentação do AutoThrottle do Scrapy mostra uma propriedade importante: respostas de erro rápidas não devem acelerar a coleta. Adaptar o intervalo por latência e falhas é mais robusto que um atraso pequeno e fixo. [21]

Para este volume, começar com uma busca em voo por fonte, intervalo configurável, limite diário e interrupção após bloqueios repetidos. `Retry-After` deve ser respeitado integralmente: quando ultrapassar o tempo do processo, reagendar. Não reduzir uma espera pedida pelo servidor para caber em um timeout local.

Depois da validação, manter uma varredura de base e priorizar datas próximas ou consultadas, reaproveitando resultados recentes com a mesma chave. TTLs e frequência devem ser configuráveis e medidos; duas atualizações diárias são uma premissa inicial de produto, não um requisito técnico nem garantia de preço atual.

### 6. Qualidade e identidade da oferta

Uma oferta deve carregar origem e destino exatos, data local, segmentos, números de voo quando disponíveis, companhia operadora, canal de venda, programa de emissão, cabine, passageiros e elegibilidade da tarifa. Para pontos, preservar pontos e parcela monetária separadamente. Para dinheiro, registrar moeda e se o valor inclui taxas. Campos desconhecidos permanecem desconhecidos.

A menor tarifa em pontos e a menor tarifa em BRL de um dia podem pertencer a voos diferentes. Não devem formar uma única oferta nem alimentar comparação de valor por ponto sem correspondência do itinerário e das condições. Também não se deve substituir PET→CGH por PET→GRU porque ambos atendem São Paulo, ou somar trechos separados como se fossem uma tarifa emitível em uma única reserva.

Separar três horários: início da tentativa, momento da observação na fonte e persistência. Uma falha de atualização não renova a idade de uma oferta anterior. Uma busca válida sem resultados deve produzir uma observação de ausência, mesmo sem gerar linhas de preço, para impedir que dados antigos continuem parecendo atuais.

## Diagnóstico do código e da execução existentes

O run `34d7cbe4-88d0-4427-ac49-9837191b5516`, em 11/09/2026 às 22:32 UTC, terminou com `scrape_failed`, 135 jobs, zero snapshots e registro da execução persistido. Smiles e GOL retornaram 406; Azul e LATAM, 403 com conteúdo de bloqueio. O teste local anterior também falhou, portanto a causa não foi isolada ao IP de saída do Cloudflare. O resumo está preservado em `/tmp/sentry-live-run.json` nesta máquina; o identificador permite localizar a execução no banco.

| Achado no repositório                                                                                     | Implicação                                                                                    | Correção planejada                                                        |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Azul e LATAM retornam sessão vazia quando não há credenciais, em `auth.ts`.                               | O caminho guest não demonstra inicialização equivalente ao site.                              | Descobrir e implementar o fluxo público necessário.                       |
| Clientes usam endpoints, corpos e headers fixos; LATAM gera um novo `x-latam-app-session-id` por request. | A validade desses contratos e o ciclo do identificador precisam de evidência.                 | Capturas datadas e sessão coerente com o comportamento observado.         |
| Resposta HTTP de sucesso sem corpo vira `{}`; parsers convertem estruturas ausentes em arrays vazios.     | Mudança de schema pode parecer ausência de voos.                                              | Validar envelope, conclusão da busca e campos obrigatórios.               |
| Resultado do parser sem snapshots vira `empty`, mesmo quando todos os itens foram descartados.            | Filtro, contrato e indisponibilidade ficam misturados.                                        | Distinguir ausência confirmada, exclusão por filtros e falha de extração. |
| `sessionPromise` fica retida no coletor durante a execução.                                               | Sessão expirada ou inicialização falha não tem recuperação explícita.                         | Ciclo de vida e renovação limitada por motivo.                            |
| `scheduler.ts` percorre todos os jobs e só grava snapshots ao final.                                      | Uma fonte bloqueada continua recebendo buscas; interrupção perde resultados ainda em memória. | Interrupção por fonte e persistência atômica por job.                     |
| `collected_at` é carimbado com o início do run para todos os resultados.                                  | A idade não corresponde necessariamente à hora efetiva de cada busca.                         | Horário de observação por job/oferta.                                     |
| Clientes não têm deadline explícito e limitam espera de retry a 8 segundos.                               | Operação pode ficar presa ou repetir antes do prazo indicado.                                 | Timeout por tentativa e reagendamento por `Retry-After`.                  |
| O Sentry de `origin/main` envia as primeiras 25 falhas.                                                   | Pode representar apenas a primeira rota/fonte de uma execução.                                | Resumos e amostras por fonte, motivo e versão.                            |

Fontes locais: [scheduler](../../workers/src/scheduler.ts), [clientes e parsers](../../workers/src/collectors/), [tipos de snapshot](../../workers/src/collectors/types.ts), [persistência](../../workers/src/supabase.ts) e [API de agregação](../../workers/src/api/aggregate.ts). O Sentry citado é o arquivo `workers/src/sentry.ts` no commit `862db27`, que ainda não existe nesta branch local.

Os testes e fixtures atuais continuam úteis para regressões. Contudo, exemplos adaptados e datas substituídas para dry-run não comprovam o contrato atual de produção. O corpus de validação deve registrar origem, data, parâmetros e resposta sanitizada de buscas reais; fixtures sintéticas devem continuar claramente identificadas.

## Arquitetura proposta para o nosso volume

O Cloudflare continua servindo frontend e API. O agendador cria jobs de coleta persistidos no Supabase. Um runner próprio em Node.js reivindica jobs por uma API interna, executa o adaptador da companhia e entrega resultado e diagnóstico. O Worker grava o resultado e encerra o job em uma transação; o frontend lê ofertas já coletadas e seu estado de atualização.

```text
Cron ou atualização específica
            ↓
Worker → jobs duráveis no Supabase
            ↓ claim com lease
Runner próprio Node.js → Smiles / Azul / LATAM
            ↓ resultado + diagnóstico + observed_at
Worker → observações e ofertas no Supabase → API de leitura → frontend
```

Para três fontes, uma tabela de jobs com claim atômico e lease reaproveita a infraestrutura existente. Não precisamos começar com Redis, múltiplas filas ou um cluster de browsers. O runner recebe um token interno limitado à coleta; a chave administrativa do Supabase permanece no Worker. O contrato deve impedir conclusão com lease vencido, duplicação de ofertas e sobrescrita de uma observação nova por uma execução antiga.

Cloudflare Queues é uma alternativa posterior, não uma dependência da primeira prova. Documenta consumidores HTTP pull e entrega pelo menos uma vez; portanto, mesmo nessa opção, idempotência continua necessária. Adotar a fila só se suas vantagens operacionais justificarem outra peça. [22]

O transporte é escolhido por adaptador. Um programa pode funcionar por HTTP e outro precisar executar a busca no navegador. Não deve haver fallback silencioso que mude moeda, companhia, programa, perfil do passageiro ou antiguidade do dado. GOL cash, quando entrar, será um adaptador distinto de Smiles.

## Critérios e experimentos antes de produzir em escala

O primeiro teste por fonte usa uma data próxima e duas futuras, escolhidas após verificar quais têm oferta na interface. Quando possível, incluir ausência real de voos e conexão. Registrar também uma rota de controle mais movimentada: ela ajuda a separar limitação de PET de falha geral, mas não conta como entrega da rota do produto.

| Etapa      | Evidência exigida                                                                               | O que não demonstra aprovação                                      |
| ---------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Descoberta | Busca pública reproduzível e preço, data, modalidade e condições identificados.                 | Página inicial carregada ou HTTP 200 sem oferta.                   |
| Contrato   | Resposta real sanitizada ligada ao resultado da interface; schema e término conhecidos.         | JSON escrito à mão com o formato esperado pelo parser.             |
| Automação  | Mesma busca funciona em sessões novas e em sessões reutilizadas; falhas classificadas.          | Uma única execução bem-sucedida.                                   |
| Ambiente   | Repetição no ambiente candidato, com versão e recursos registrados.                             | Funcionamento apenas no computador do desenvolvedor.               |
| Operação   | Janela de sete dias por fonte, seguida de 45 dias, com observabilidade e interrupção por fonte. | Contar ausência, bloqueio ou registros dry-run como ofertas reais. |

Metas propostas para o piloto: 30 buscas distribuídas por fonte ao longo de três dias; pelo menos 95% de buscas válidas, contando ausência apenas quando confirmada; revisão de dez ofertas por fonte contra a interface com os mesmos parâmetros e horário próximo; nenhuma confusão de moeda, modalidade, elegibilidade ou rota. Uma mudança real de preço durante a comparação precisa ser registrada e repetida, não automaticamente atribuída ao parser. Essas metas são critérios de engenharia iniciais, não SLA demonstrado; a amostra pequena não prova estabilidade de longo prazo.

## Volume e custo de operação própria

No escopo mínimo, são 3 fontes × 45 datas = 135 buscas lógicas por varredura. Com duas varreduras diárias, 270 buscas/dia e 8.100 em 30 dias. No escopo atual de cinco modalidades, são 225 buscas por varredura e 13.500 em 30 dias. Jobs lógicos não equivalem a requests HTTP: uma busca no navegador pode gerar muitas requisições de sessão, dados e recursos.

Como exemplo de dimensionamento, se uma busca ocupar o navegador por 15–30 segundos, 270 buscas representam 67,5–135 minutos de atividade diária, sem contar inicializações e retries. São hipóteses para medir, não benchmarks das companhias. Medir duração, memória, bytes, reutilização de sessão e buscas válidas por hora antes de escolher hospedagem.

O custo relevante é infraestrutura mais manutenção por busca válida. Reaproveitar sessão, respostas recentes e calendário público quando seu contrato for comprovado pode reduzir custo. O resultado de calendário deve continuar marcado como indicativo até existir oferta detalhada correspondente.

## Alternativas consultadas e excluídas da implementação

APIs de terceiros foram examinadas para entender o mercado, mas não integram o plano. Seats.aero oferece dados de pontos sob condições de acesso; a documentação da LATAM descreve conexão NDC voltada a agências e agregadores com requisitos de entrada; isso não equivale a uma API pública anônima para o nosso caso. [8][23]

O próprio Skyscanner restringe o serviço live a consultas originadas por ação do usuário, tornando-o inadequado como substituto automático do nosso cron sob suas diretrizes publicadas. [24]

Foram encontrados repositórios públicos de scrapers Smiles e LATAM. Seus autores os apresentam como projetos específicos/educacionais. Não há nas páginas consultadas comprovação de operação atual e confiável para nossas rotas; podem sugerir fluxos, mas não fornecer um contrato validado para copiar. [25][26]

## Incertezas que a implementação precisa resolver

Permanecem sem comprovação: o fluxo guest atual de cada companhia; a aceitação da automação no ambiente escolhido; as condições exatas das tarifas públicas em pontos; o formato e a unidade de cada valor retornado; a cobertura de PET em cada data; o comportamento após expiração de sessão; e a existência de busca por calendário que possa ser reaproveitada corretamente.

A primeira entrega deve fechar essas incertezas com evidência. Depois dela, cada adaptador ganha um contrato versionado e critérios de manutenção. Ampliar a coleta antes disso apenas multiplica o mesmo problema de acesso ou interpretação.

## Fontes

Todas as fontes abaixo foram consultadas em 11/09/2026. Quando não há data editorial confiável, registra-se “s.d.”. Páginas de documentação descrevem a versão disponível na consulta.

1. Seats.aero. [Why are my search results empty or missing airlines?](https://docs.seats.aero/article/47-why-are-my-search-results-empty-or-missing-airlines), atualização de 27/07/2026. Cobertura, cache e busca live.
2. Roame, The Roame Team. [How to use Roame SkyView Search](https://roame.travel/guides/skyview), 18/05/2026. Rotas rastreadas e idade dos dados.
3. AwardFares, Germán. [Timeline View: Search For Award Flights In Real Time Across Multiple Dates](https://awardfares.com/blog/timeline-view/), atualização de 10/06/2025. Calendário e atualização seletiva.
4. point.me. [How do I run a search with the Self-Serve tool?](https://connect.point.me/help/how-do-i-run-a-search-with-the-self-serve-tool), s.d. Latência e verificações declaradas.
5. Skyscanner. [Flights Live Prices: quick start](https://developers.skyscanner.net/docs/flights-live-prices/quick-start) e [FAQ: Flights Indicative Prices](https://developers.skyscanner.net/docs/faqs), s.d. Consulta a parceiros e preços indicativos.
6. Seats.aero. [API Concepts](https://developers.seats.aero/reference/concepts-copy), s.d. Fontes e granularidade de disponibilidade/itinerário.
7. Seats.aero. [Live Search API](https://developers.seats.aero/reference/live-search), s.d. Filtros, erros, cache opcional e restrição de acesso.
8. Seats.aero. [Getting Started: partner API](https://developers.seats.aero/reference/getting-started-p), s.d. Condições de uso pessoal e comercial.
9. Ian Carroll / SeatsIan. [Post #43 no Australian Frequent Flyer](https://www.australianfrequentflyer.com.au/community/threads/seats-aero-a-useful-tool-for-finding-qantas-velocity-reward-availability.110423/page-3), 11/10/2023. Declaração histórica de primeira mão; não usada para presumir a implementação atual.
10. Roame, The Roame Team. [How to create award flight alerts](https://roame.travel/guides/alerts), 18/05/2026. Reaproveitamento de buscas e atualização por demanda.
11. Seats.aero. [System Status](https://seats.aero/status), página dinâmica. Isolamento de falhas por programa.
12. Seats.aero. [What does “phantom availability” mean?](https://docs.seats.aero/article/15-what-does-phantom-availability-mean), atualização de 29/01/2026. Limites de confiabilidade do inventário.
13. Scrapy. [Selecting dynamically-loaded content](https://docs.scrapy.org/en/latest/topics/dynamic-content.html), documentação corrente. Descoberta e reprodução de requisições.
14. Microsoft / Playwright. [Network](https://playwright.dev/docs/network), documentação corrente. Observação de requests/responses.
15. Microsoft / Playwright. [APIRequestContext](https://playwright.dev/docs/api/class-apirequestcontext), documentação corrente. Compartilhamento de cookies.
16. Crawlee. [PlaywrightCrawler](https://crawlee.dev/js/api/playwright-crawler/class/PlaywrightCrawler), documentação corrente. Execução e controle de concorrência.
17. Crawlee. [Session Management](https://crawlee.dev/js/docs/guides/session-management), documentação estável consultada, versão 3.18. Estado e gerenciamento de sessões; não usada a documentação `next`.
18. Akamai. [Bot Manager](https://www.akamai.com/products/bot-manager), s.d. Categorias de sinais utilizadas na detecção.
19. Cloudflare. [Browser Run FAQ](https://developers.cloudflare.com/browser-run/faq/), atualização de 17/07/2026. Identificação e rede de origem do navegador gerenciado.
20. Cloudflare. [Crawl entire websites with a single API call using Browser Rendering](https://developers.cloudflare.com/changelog/post/2026-03-10-br-crawl-endpoint/), 10/03/2026, com esclarecimentos posteriores na página. Limites do endpoint `/crawl`.
21. Scrapy. [AutoThrottle extension](https://docs.scrapy.org/en/latest/topics/autothrottle.html), documentação corrente. Controle de carga e tratamento de respostas rápidas de erro.
22. Cloudflare. [How Queues Works](https://developers.cloudflare.com/queues/reference/how-queues-works/), atualização de 21/04/2026. Consumo HTTP e entrega pelo menos uma vez.
23. LATAM Trade. [Conexão via API NDC](https://www.latamtrade.com/pt_pt/procom/conexao-viaiAPI-NDC), s.d. Público-alvo e requisitos publicados.
24. Skyscanner. [Usage Guidelines](https://developers.skyscanner.net/docs/getting-started/usage-guidelines), s.d. Restrição a consultas live iniciadas por usuário.
25. GabrielGHAM. [webscrapping.smiles](https://github.com/GabrielGHAM/webscrapping.smiles), s.d. Exemplo público educacional, sem validação de execução neste estudo.
26. SantiagoAlarconDS. [Latam-Airlines-Flights-Scraper](https://github.com/SantiagoAlarconDS/Latam-Airlines-Flights-Scraper), s.d. Exemplo público em Selenium, sem validação de execução neste estudo.

[1]: https://docs.seats.aero/article/47-why-are-my-search-results-empty-or-missing-airlines
[2]: https://roame.travel/guides/skyview
[3]: https://awardfares.com/blog/timeline-view/
[4]: https://connect.point.me/help/how-do-i-run-a-search-with-the-self-serve-tool
[5]: https://developers.skyscanner.net/docs/faqs
[6]: https://developers.seats.aero/reference/concepts-copy
[7]: https://developers.seats.aero/reference/live-search
[8]: https://developers.seats.aero/reference/getting-started-p
[9]: https://www.australianfrequentflyer.com.au/community/threads/seats-aero-a-useful-tool-for-finding-qantas-velocity-reward-availability.110423/page-3
[10]: https://roame.travel/guides/alerts
[11]: https://seats.aero/status
[12]: https://docs.seats.aero/article/15-what-does-phantom-availability-mean
[13]: https://docs.scrapy.org/en/latest/topics/dynamic-content.html
[14]: https://playwright.dev/docs/network
[15]: https://playwright.dev/docs/api/class-apirequestcontext
[16]: https://crawlee.dev/js/api/playwright-crawler/class/PlaywrightCrawler
[17]: https://crawlee.dev/js/docs/guides/session-management
[18]: https://www.akamai.com/products/bot-manager
[19]: https://developers.cloudflare.com/browser-run/faq/
[20]: https://developers.cloudflare.com/changelog/post/2026-03-10-br-crawl-endpoint/
[21]: https://docs.scrapy.org/en/latest/topics/autothrottle.html
[22]: https://developers.cloudflare.com/queues/reference/how-queues-works/
[23]: https://www.latamtrade.com/pt_pt/procom/conexao-viaiAPI-NDC
[24]: https://developers.skyscanner.net/docs/getting-started/usage-guidelines
[25]: https://github.com/GabrielGHAM/webscrapping.smiles
[26]: https://github.com/SantiagoAlarconDS/Latam-Airlines-Flights-Scraper
