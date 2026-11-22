# Mapas Branco Peres — pacote para Google AI Studio

Este é um app web existente em React 18 + TypeScript + Vite. O arquivo `AI_STUDIO_CONTEXT.md` contém o contexto inicial curto para colar no AI Studio. Não cole o repositório inteiro no prompt: isso pode causar “exceeded tokens”.

## Fluxo sugerido no AI Studio

1. Use o contexto curto de `AI_STUDIO_CONTEXT.md` para descrever o projeto e o objetivo da tarefa.
2. Para cada mudança, forneça apenas os arquivos diretamente relacionados (por exemplo, `MapContainer.tsx` e o hook correspondente), em vez de todo o código e dados do mapa.
3. Solicite uma alteração por vez e peça um diff/patch pequeno. Preserve arquivos não envolvidos.
4. Arquivos em `public/` incluem GeoJSON, MBTiles e imagens usados em runtime. São dados/recursos, não devem ser colados como texto no prompt.

## Executar localmente

Requer Node.js 18 ou superior. Instale dependências com `npm install` ou `yarn install`; execute `npm run dev` para desenvolvimento e `npm run build` para compilar.

A integração Supabase é opcional no desenvolvimento e fica offline sem configuração. Para habilitá-la, copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com as credenciais do seu próprio projeto Supabase. Nunca cole credenciais privadas no prompt ou em código público.

## Observação

O Google AI Studio é uma interface de desenvolvimento com modelos; este pacote não presume que o AI Studio importe um ZIP inteiro como um projeto Vite executável. Use o contexto curto e compartilhe seletivamente os arquivos relevantes. O ZIP completo mantém o app e seus recursos para uso no ambiente de desenvolvimento adequado.
