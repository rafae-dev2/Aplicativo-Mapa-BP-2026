# Testes v188 — voo apenas após selecionar

O temporizador de voo ao digitar foi removido. A pesquisa apenas atualiza os resultados; fundo e talhão só são selecionados quando o usuário toca/clica no resultado ou confirma com Enter. A tela verde animada e o cache offline foram preservados.

TypeScript e build passaram. Os dados geográficos, planejamentos e configuração pública do Supabase permanecem idênticos aos arquivos recebidos; não houve alteração do banco.

| Teste | Resultado |
|---|---|
| Abertura original: fundo verde, logo centralizado e animação | Passou |
| Primeira abertura: interface e canvas do mapa | Passou |
| Digitar fundo 25 apenas filtra, sem mover o mapa | Passou |
| Número com zero à esquerda apenas filtra, sem voo | Passou |
| Número inexistente não move o mapa | Passou |
| Enter sem setas confirma resultado e voa até o talhão | Passou |
| Toque em outro talhão provoca novo voo | Passou |
| Primeira instalação prepara shell e dados para offline | Passou |
| Migração de manutenção preserva shell, fila e dados locais | Passou |
| Reabertura sem rede mostra o aplicativo e o mapa | Passou |
| Ferramenta lazy carrega também sem rede | Passou |
| Menu lateral lazy abre sem rede | Passou |
| Falha dos dados não bloqueia a interface | Passou |
| Botão Tentar novamente dispara busca e recupera os dados | Passou |
| Rede lenta sem shell não retorna falso offline | Passou |
| Nenhuma exceção JavaScript não tratada | Passou |

As chamadas de câmera foram monitoradas apenas no navegador de teste; não há instrumentação no aplicativo entregue. Chromium headless, Mapbox simulado e Supabase bloqueado. A publicação Netlify e os testes no aparelho real não foram realizados.
