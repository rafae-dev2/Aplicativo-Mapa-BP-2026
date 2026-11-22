# Mapas Branco Peres — v187

Esta versão restaura a tela de abertura anterior com fundo verde, logotipo centralizado, anéis animados e barra de carregamento. A animação acompanha o carregamento real; não é adicionada uma espera artificial. O mapa continua sendo preparado em paralelo e o cache offline da versão otimizada é preservado.

A busca volta a localizar automaticamente a fazenda ao digitar um número exato de fundo, incluindo números com zero à esquerda. Uma pausa curta na digitação evita vários voos durante a formação do número. A lista de talhões continua disponível; selecionar um talhão por toque ou confirmar com Enter leva até a área escolhida.

## Publicar

Extraia `netlify-dist-mapas-branco-peres-v187.zip` e publique a pasta `dist` no site já existente do Netlify, pela área Deploys. A pasta deve conter o HTML, `assets`, dados, manifesto e service worker. Depois abra o aplicativo com internet e aceite a atualização, se aparecer. Aguarde a preparação dos arquivos para testar offline.

Não limpe os dados do Chrome nem desinstale o PWA se existirem marcações não sincronizadas. A atualização preserva localStorage, IndexedDB, fila pendente, geometrias e a configuração pública existente do Supabase.

## Código-fonte

Use Node.js 22. Na pasta `mapas`, execute `npm ci`, `npm run typecheck` e `npm run build`. O build gera a pasta `dist` e seu manifesto offline com os nomes reais dos módulos.

## Supabase

Não há mudança de esquema, de tabelas ou de dados. Não é necessário executar SQL nem recriar o banco. Esta entrega usa o Supabase já configurado nos arquivos enviados; não inclui uma chave privilegiada nem altera permissões do projeto.

## Validação

A verificação final de compilação e os testes da tela de abertura, busca e cache acompanham o código-fonte na pasta `docs`. Os testes de navegador simulam o estilo do mapa e bloqueiam o Supabase para não ler ou gravar no banco de produção. A publicação no Netlify e o teste no celular real ficam a cargo do responsável pelo site.
