# Mapas Branco Peres — v188

A busca agora apenas filtra a lista enquanto você digita. O mapa não voa ao digitar o número do fundo, mesmo quando há correspondência exata. Para mover o mapa, selecione um resultado que contenha **fundo e talhão**, por toque/clique ou pela confirmação com Enter. As setas do teclado permitem escolher o resultado antes de confirmar; Enter sem setas confirma o primeiro resultado.

A abertura com fundo verde e logotipo animado foi mantida, assim como as otimizações de carregamento e cache offline. Dados agrícolas, marcações, fila pendente e configuração pública do Supabase permanecem preservados.

## Publicar

Extraia `netlify-dist-mapas-branco-peres-v188.zip` e publique a pasta `dist` no site existente do Netlify, na área Deploys. Abra o aplicativo com internet e aceite a atualização, se aparecer. Não limpe o armazenamento do Chrome nem desinstale o PWA se houver marcações ainda não sincronizadas.

## Código-fonte

Na pasta `mapas`, com Node.js 22, execute:

```sh
npm ci
npm run typecheck
npm run build
```

O build gera a pasta `dist` completa e o manifesto offline correspondente. Os arquivos geográficos mantêm a URL versionada anterior porque os dados não foram modificados; a versão do aplicativo e do service worker é 188.

Não é necessário executar SQL nem modificar o Supabase. Esta tarefa prepara os arquivos de publicação; não publica diretamente no seu site. Os testes de navegador usam Mapbox simulado e bloqueiam o Supabase para não acessar o banco real.
