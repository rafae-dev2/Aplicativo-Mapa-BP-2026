# Aplicativo Mapa BP 2026 — Mapas Branco Peres

Aplicativo web de mapas operacionais da **Branco Peres Agro**: talhões e fazendas, pontos de
interesse (POI), rotas, GPS em tempo real, ferramentas de desenho, planejamento agrícola e suporte
offline via PWA.

Este repositório contém o **código-fonte da versão 189**.

## Stack

| Camada        | Tecnologia                                              |
| ------------- | ------------------------------------------------------- |
| Framework     | React 18 + TypeScript                                   |
| Build         | Vite 5                                                  |
| Estilo        | Tailwind CSS + Radix UI + lucide-react                  |
| Mapas         | Mapbox GL JS / react-map-gl, Turf.js, MBTiles, GeoJSON  |
| Dados         | Supabase (opcional, via variáveis de ambiente)          |
| Roteamento    | wouter                                                  |
| Hospedagem    | Netlify (`netlify.toml`)                                |

## Começando

Requer Node.js 18 ou superior (recomendado 22).

```bash
npm ci              # instala dependências a partir do package-lock.json
cp .env.example .env   # opcional: preencha as chaves do seu Supabase
npm run dev         # ambiente de desenvolvimento
npm run build       # gera a pasta dist/ para publicação
npm run preview     # pré-visualiza o build
```

Verificação de qualidade:

```bash
npm run typecheck   # checagem de tipos TypeScript
npm run lint        # ESLint
```

## Estrutura

```
.
├── index.html              # shell da aplicação
├── netlify.toml            # configuração de build e headers do Netlify
├── vite.config.ts          # build, PWA e plugins
├── src/
│   ├── App.tsx             # roteamento e providers
│   ├── pages/              # telas principais (Home e demais páginas)
│   ├── components/         # mapa, POI, rotas, GPS, desenho, controles, UI base
│   ├── hooks/              # câmera, MBTiles, fazendas, planejamento, compartilhamento
│   ├── lib/                # integrações e utilitários (Supabase, geometria, cache)
│   ├── config/             # constantes de configuração
│   └── index.css           # estilos globais e temas
├── public/                 # dados e recursos de runtime
│   ├── *.geojson           # geometria de talhões e fazendas
│   ├── *.mbtiles           # camadas offline (tiles e índices)
│   ├── manifest.json       # PWA
│   └── _headers/_redirects # regras do Netlify
├── scripts/                # geração do app shell e do runtime config
└── docs/                   # relatórios, histórico de versões e testes
```

## Variáveis de ambiente

Copie `.env.example` para `.env`. A integração com Supabase é opcional: sem as chaves o app
funciona em modo offline.

| Variável                    | Descrição                             |
| --------------------------- | ------------------------------------- |
| `VITE_SUPABASE_URL`         | URL do projeto Supabase               |
| `VITE_SUPABASE_ANON_KEY`    | Chave pública (anon) do Supabase      |

> Nunca faça commit de credenciais. `.env` e `.env.*` estão no `.gitignore`.

## Deploy no Netlify

O build gera a pasta `dist/`. As regras de cache, os cabeçalhos e os redirects estão em
`netlify.toml` e `public/_headers`.

```bash
npm run build   # publica a pasta dist no site existente
```

Após publicar, abra o aplicativo com internet e aceite a atualização do PWA quando o banner
sugerir. Não limpe os dados do navegador nem desinstale o PWA enquanto houver marcações locais
ainda não sincronizadas.

## Documentação

- [`LEIA-ME-ATUALIZACAO-v189.md`](LEIA-ME-ATUALIZACAO-v189.md) — instruções da versão atual
- [`RELATORIO-v189.md`](RELATORIO-v189.md) — relatório de correções
- [`docs/`](docs) — histórico das versões anteriores e registros de testes
- [`README_AI_STUDIO.md`](README_AI_STUDIO.md) e [`AI_STUDIO_CONTEXT.md`](AI_STUDIO_CONTEXT.md)
  — fluxo sugerido para evoluir o código com assistentes de IA

## Licença

Todos os direitos reservados — Branco Peres Agro. Este repositório é público para fins de
divulgação do código-fonte do aplicativo.
