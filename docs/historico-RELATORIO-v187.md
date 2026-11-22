# Verificação v187 — abertura e busca

A inicialização anterior foi restaurada com fundo verde, logotipo ao centro e animações. O mapa continua carregando em paralelo, sem tempo mínimo obrigatório. Se a rede impedir a preparação, a tela inicial libera os controles de recuperação depois de no máximo oito segundos da montagem da página.

Ao digitar um fundo exato e aguardar 300 ms, o mapa enquadra todos os talhões da fazenda. Zero à esquerda é aceito; Enter sem setas e seleção por toque continuam focando o talhão. Consultas sem fundo correspondente não provocam voo automático.

`npm run typecheck` e `npm run build` passaram. Todos os caminhos do manifesto offline existem no pacote. Mapas, rótulos, planejamentos e configuração pública do Supabase foram comparados com o ZIP original e continuam idênticos. Não houve acesso ao banco nem migração SQL.

| Teste | Resultado |
|---|---|
| Abertura original: fundo verde, logo centralizado e animação | Passou |
| Primeira abertura: interface e canvas do mapa | Passou |
| Digitar fundo 25 voa automaticamente para a fazenda inteira | Passou |
| Fundo com zero à esquerda também provoca voo | Passou |
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

Os testes utilizaram Chromium headless, estilo Mapbox simulado e bloqueio do Supabase. As chamadas de `fitBounds` e `flyTo` foram observadas somente no navegador de teste, sem inserir instrumentação no aplicativo entregue. A publicação Netlify e a validação no celular real não foram realizadas.
