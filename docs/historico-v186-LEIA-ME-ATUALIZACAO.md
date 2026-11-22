# Mapas Branco Peres — atualização v186

## Publicação manual no Netlify

Extraia `netlify-dist-mapas-branco-peres-v186.zip` e publique a pasta `dist`, que contém `index.html`, `assets`, os mapas e o service worker. Use o **site já existente** no Netlify: abra Deploys e arraste a pasta `dist` para a área de publicação manual. Não envie o ZIP sem extrair e não publique apenas `index.html` ou apenas `assets`.

A configuração pública do Supabase foi mantida a partir do projeto enviado. Não coloque uma chave `service_role` no front-end. Esta atualização não altera o esquema nem os registros do banco e não exige execução de SQL. Os arquivos originais não continham scripts de criação do banco; a correção deve usar o projeto Supabase existente.

## Após publicar

Abra o aplicativo com internet e, se aparecer, toque em **Atualizar agora**. A atualização do service worker acontece em segundo plano. Na primeira utilização desta versão, aguarde a preparação do cache antes de testar sem conexão; é necessário baixar a interface e os dados pelo menos uma vez. Feche e reabra o aplicativo ainda com internet e depois teste no modo avião.

Se o celular continuar preso à tela antiga “Offline — Sem conexão”, tente abrir o site com internet usando `?recuperar=186` ao final da URL. Um worker antigo pode ainda interceptar a navegação, então essa alternativa não é garantida. Mantenha a conexão ativa e feche/reabra o Chrome para permitir que ele busque o worker atualizado. Como diagnóstico, uma janela anônima permite conferir o novo deploy sem usar o cache antigo, mas não dá acesso às marcações salvas no navegador normal.

**Não limpe os dados do site, não desinstale o PWA e não apague o armazenamento do Chrome se houver marcações ainda não sincronizadas.** Esses procedimentos podem excluir dados locais. A correção preserva `localStorage`, IndexedDB, fila pendente e os caches de mapa; não é preciso fazer uma limpeza geral.

## O que mudou

O bootstrap mostra uma tela leve imediatamente e carrega o aplicativo de forma assíncrona. Ferramentas, o menu lateral e painéis pesados são separados em módulos sob demanda. Uma vez aberto, o menu continua montado ao fechar para manter seus painéis. Bibliotecas principais ficam em arquivos com hash que podem ser reutilizados do cache. Fontes deixam de bloquear a primeira pintura e o logotipo inicial passa a usar uma imagem menor.

O shell offline deixa de ser apagado pela manutenção. Dados e bundles já armazenados não são baixados novamente em cada abertura. A navegação com shell disponível não precisa esperar três segundos pela rede; quando não existe shell, a rede lenta não deve ser tratada como ausência de conexão após esse limite. As tentativas de carregar dados são finitas, canceláveis e o botão **Tentar novamente** sempre dispara uma nova busca. O retorno da conexão permite tentar novamente.

O mapa base e seus controles também são montados em paralelo ao download dos talhões, sem uma tela de carregamento que bloqueie tudo.

As geometrias dos 1.740 talhões e suas propriedades foram preservadas. Não houve nova simplificação de limites nem alteração dos dados agrícolas para obter ganho de desempenho.

## Código-fonte

Requisitos: Node.js 22 e npm. Na pasta `mapas`, execute:

```sh
npm ci
npm run typecheck
npm run build
```

O build gera `dist/runtime-config.js` e `dist/app-shell-assets.json`. O manifesto offline contém os nomes reais das versões compiladas, incluindo módulos sob demanda. Não edite nomes de arquivos dentro de `dist/assets` manualmente.

Para publicação pelo repositório, `netlify.toml` já aponta para `dist`. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no Netlify se quiser substituir a configuração pública existente.

## Limites

O primeiro download ainda depende da qualidade da conexão, do aparelho e dos serviços externos. O funcionamento offline só cobre arquivos e áreas de mapa que tenham sido preparados/baixados; não inclui automaticamente todas as imagens de satélite do mundo. O Supabase continua dependendo de internet para sincronização. A validação em laboratório não substitui uma medição no celular real.
