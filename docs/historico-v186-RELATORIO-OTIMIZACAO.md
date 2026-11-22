# Correção de inicialização e offline — v186

## Diagnóstico

A tela simples “Offline — Sem conexão” vinha de uma resposta de navegação do service worker. A rotina de manutenção apagava o cache estável da interface, incluindo HTML e bundles necessários para a reabertura offline. A navegação aguardava uma corrida de rede com limite de três segundos; sem shell disponível, uma conexão apenas lenta podia cair na resposta 503.

Além disso, bundles, dados e tiles já presentes no cache eram buscados novamente. A consulta de atualização era duplicada entre cabeçalho e banner. O botão de nova tentativa resetava o contador para zero, sem garantir uma mudança de estado que disparasse outra requisição. Ferramentas, modais e o menu lateral também eram carregados no pacote inicial.

## Correção

A manutenção deixa de apagar Cache Storage e preserva marcações, fila, tombstones, preferências e IndexedDB. A instalação prepara a interface em um cache temporário: valida os arquivos necessários, copia os recursos e só então promove o HTML. O manifesto é gerado a partir do build real, incluindo módulos sob demanda. Caches de outros escopos ou integrações não são removidos.

Com shell disponível, a navegação o entrega imediatamente e tenta atualização em segundo plano. Sem shell, uma rede lenta recebe um limite maior em vez de ser considerada offline após três segundos. Quando não há interface armazenada nem rede utilizável, o aplicativo apresenta uma página de recuperação com nova tentativa; não promete abrir dados que nunca foram baixados.

Os bundles com hash ficam em cache sem downloads de revalidação repetidos. Os dados geográficos usam uma URL versionada. Os tiles têm gravação tolerante a falhas de armazenamento e limpeza limitada em lotes, sem enumeração de todo o cache para cada tile. Falhas de gravação de cache não transformam uma resposta de rede bem-sucedida em erro.

A interface inicial carrega por um bootstrap pequeno. O mapa base e controles são montados em paralelo aos dados dos talhões; uma falha de dados não desmonta o mapa inteiro. As ferramentas e os painéis recebem fronteiras Suspense locais. O menu só baixa seu módulo ao ser aberto e continua montado após fechar. As ferramentas de desenho também permanecem montadas após o primeiro uso para preservar seu estado.

Os scripts de atualização deixam de solicitar o mesmo GeoJSON na primeira abertura. O retorno da conexão e o botão Tentar novamente podem iniciar uma nova busca. As fontes não bloqueiam a primeira pintura e o logotipo do cabeçalho usa uma versão menor do mesmo recurso visual.

## Dados e banco

Os arquivos de mapas, rótulos e planejamento foram comparados por bytes com o ZIP recebido e permanecem iguais. São 1.740 features no arquivo utilizado pelo aplicativo. Nenhuma nova simplificação geométrica foi aplicada. A configuração pública existente do Supabase foi preservada; não houve acesso nem alteração do banco de produção.

Esta é uma correção de front-end/PWA, não uma migração de banco. Portanto, não é necessário executar SQL, recriar tabelas nem reinserir dados.

## Verificação e métricas

As métricas finais e o resultado dos testes constam na seção complementar gerada após a validação. É importante distinguir tamanho do bootstrap, tamanho dos arquivos para exibir o mapa e tamanho total da aplicação: dividir o código reduz o trabalho inicial, mas não elimina bibliotecas necessárias ao mapa.

Os testes de navegador utilizam Chromium headless, um estilo Mapbox simulado e bloqueio das chamadas Supabase. Eles verificam a aplicação e os mecanismos de cache sem enviar dados ao banco real. Não medem a rede do celular mostrado na imagem, o desempenho real de satélite nem o tempo de sincronização do Supabase.

## Resultados finais

`npm run typecheck` e `npm run build` concluídos com sucesso. A validação de integridade confirmou que todos os caminhos do manifesto offline existem no pacote final.

| Métrica de arquivos (sem compressão) | Original | v186 |
|---|---:|---:|
| JavaScript antes da primeira tela React (bootstrap + React) | 1740.5 kB | 147.4 kB |
| JavaScript central estimado para exibir o mapa | 1740.5 kB | 1580.7 kB |
| Logotipo usado pelo cabeçalho | 256.4 kB | 38.2 kB |

O bootstrap caiu 91.5% em bytes. **Isso não significa que o aplicativo inteiro ficou 91.5% menor ou mais rápido**: Mapbox e outros módulos ainda precisam carregar para exibir o mapa. O conjunto central estimado caiu 9.2%; o ganho adicional esperado vem da interface antecipada, dos downloads em paralelo e da reutilização de cache. As estimativas acima não incluem CSS, imagens, fontes, mapas ou dependências compartilhadas menores.

| Teste de navegador | Resultado |
|---|---|
| Primeira abertura: interface e canvas do mapa | Passou |
| Primeira instalação prepara shell e dados para offline | Passou |
| Migração de manutenção preserva shell, fila e dados locais | Passou |
| Reabertura sem rede mostra o aplicativo e o mapa | Passou |
| Ferramenta lazy carrega também sem rede | Passou |
| Menu lateral lazy abre sem rede | Passou |
| Falha dos dados não bloqueia a interface | Passou |
| Botão Tentar novamente dispara busca e recupera os dados | Passou |
| Rede lenta sem shell não retorna falso offline | Passou |
| Nenhuma exceção JavaScript não tratada | Passou |

O teste de rede lenta atrasou propositalmente a resposta HTML em 4,2 segundos, acima do limite antigo de 3 segundos; o aplicativo iniciou sem retornar falso offline. O teste offline verificou shell, dados, ferramenta GPS e menu sob demanda. Não foram iniciadas medições GPS reais nem feitas alterações no banco.

A abertura no aparelho da imagem e a publicação no Netlify não foram realizadas nesta tarefa. Os ZIPs são os arquivos preparados e validados para publicação pelo responsável pelo site.
