# Mapas Branco Peres — correção de seleção v189

A versão publicada verificada em https://mapasbrancoperes.netlify.app/ era a 188. Foram reproduzidos dois problemas: selecionar outro fundo/talhão pela busca mantinha os detalhes do talhão anterior abertos; a URL continuava com o alvo antigo, fazendo o aplicativo retornar à área anterior ao recarregar.

A v189 atualiza a URL ao selecionar pela busca ou ao clicar numa área, fecha o painel antigo ao pedir um novo foco e consome cada pedido de câmera apenas uma vez. Abrir a busca fecha o painel de detalhes que bloqueava o toque nos resultados em celulares. Digitar continua apenas filtrando resultados. Clicar em um polígono abre seus detalhes sem reaproveitar o voo de uma seleção anterior.

O enquadramento considera todas as partes do talhão, inclusive MultiPolygon, e mantém um limite de zoom. Não depende de uma espera indefinida por tiles/fontes para mover a câmera. Uma seleção mais recente interrompe o voo anterior. A exibição de área não repete a unidade `ha`.

A inicialização automática de URL só é aplicada uma vez por montagem. Abrir a pesquisa entrega o controle ao usuário, impedindo que o foco padrão de uma abertura lenta se aplique depois durante a digitação. Uma nova escolha de fazenda substitui o destino de um link de marcação na URL, sem alterar a marcação no banco. Outros parâmetros de configuração são mantidos.

## Atualização no Netlify

Extraia `netlify-dist-mapas-branco-peres-v189.zip` e publique a pasta `dist` no site existente, na área Deploys do Netlify. Abra o aplicativo com internet e aceite a atualização, se aparecer. O site permanece na versão anterior até publicar este pacote.

Não apague os dados do Chrome nem desinstale o PWA se houver marcações não sincronizadas. Nenhuma geometria, marcação, fila local ou registro do Supabase foi alterado. Não há SQL para executar nem migração de banco.

## Código-fonte e testes

Com Node.js 22, na pasta `mapas`, execute `npm ci`, `npm run typecheck` e `npm run build`. Os testes de câmera e cache estão registrados em `docs/testes-inicializacao-v189.json`. Eles usam estilo Mapbox simulado e Supabase bloqueado; não gravam dados no banco real.

O relatório de correção distingue os problemas observados no site e os testes da versão preparada. A publicação no Netlify não foi feita nesta tarefa.
