# Correção de seleção — v189

No site publicado, a versão 188 mantinha o painel de Fundo 25/Talhão 3 depois de selecionar Fundo 1/Talhão 1 pela busca. O destaque e a câmera apontavam para 1/1, mas o painel e a URL continuavam em 25/3. Esse estado divergente podia levar a compartilhar o destino antigo ou voltar à seleção anterior ao recarregar. A área também apresentava a unidade duplicada, como `0.04 ha ha`.

A versão preparada fecha o painel anterior ao pedir novo foco, atualiza a URL da seleção e aplica a inicialização automática apenas uma vez por montagem. Pedidos de câmera são consumidos uma única vez, sem depender de `idle` de tiles/fontes; o último pedido interrompe o voo anterior. Um clique no polígono abre detalhes sem reutilizar um pedido antigo. O enquadramento usa os limites de todas as partes da geometria, com zoom máximo controlado. Digitar continua apenas filtrando.

A compilação e verificação TypeScript passaram. Os dados geográficos, planejamentos e configuração pública do Supabase foram comparados com os arquivos recebidos e continuam idênticos. Nenhum registro do banco foi modificado e não há migração SQL.

## Validação

- Abertura original: fundo verde, logo centralizado e animação: passou.
- Primeira abertura: interface e canvas do mapa: passou.
- Digitar fundo 25 apenas filtra, sem mover o mapa: passou.
- Número com zero à esquerda apenas filtra, sem voo: passou.
- Número inexistente não move o mapa: passou.
- Enter sem setas confirma resultado e voa até o talhão: passou.
- Toque em outro talhão provoca novo voo: passou.
- URL acompanha fundo e talhão selecionados: passou.
- Clique em polígono abre detalhes sem reutilizar voo antigo: passou.
- Área não duplica unidade ha: passou.
- Abrir busca fecha painel que bloqueava toque nos resultados: passou.
- Nova seleção fecha detalhes anteriores e atualiza URL: passou.
- Seleção executa câmera mesmo com estilo pendente: passou.
- Enquadramento considera limites das partes do talhão: passou.
- Seleções rápidas preservam o último fundo e talhão: passou.
- Primeira instalação prepara shell e dados para offline: passou.
- Migração de manutenção preserva shell, fila e dados locais: passou.
- Recarregar mantém a seleção mais recente na URL: passou.
- Reabertura sem rede mostra o aplicativo e o mapa: passou.
- Ferramenta lazy carrega também sem rede: passou.
- Menu lateral lazy abre sem rede: passou.
- Falha dos dados não bloqueia a interface: passou.
- Botão Tentar novamente dispara busca e recupera os dados: passou.
- Rede lenta sem shell não retorna falso offline: passou.
- Nenhuma exceção JavaScript não tratada: passou.

Os problemas originais foram observados no site publicado [1]. Os testes da correção ocorreram em Chromium local, com Mapbox simulado e Supabase bloqueado, sem gravação no banco. A instrumentação de câmera só existe no navegador de teste, não no aplicativo entregue. O pacote v189 ainda precisa ser publicado no Netlify; a versão ao vivo não foi substituída nesta tarefa.

## References

[1]: https://mapasbrancoperes.netlify.app/ "Mapas Branco Peres — aplicativo publicado, versão 188 verificada"
