# Amor — e — Mistério | Checkout piloto

## Direção visual
Checkout e páginas de pedido/retorno com identidade bordô, preto e dourado, inspirada na referência fornecida pelo usuário.

## Fluxo atual do piloto
1. Cliente escolhe pequena, média ou grande.
2. Informa CEP.
3. Backend calcula frete demonstrativo (valores de teste).
4. Backend registra pedido no Supabase.
5. Página de pedido apresenta produto, frete e total.
6. O pagamento será feito por um link de valor aberto do Mercado Pago, configurado manualmente no servidor; o comprador precisa digitar exatamente o total exibido.
7. A equipe confere o recebimento manualmente no painel Mercado Pago.
8. Após a integração administrativa/Tally, o formulário de entrega será liberado.
9. Google Sheets permanece pendente.

## Importante
- Este projeto é protótipo. Não habilitar vendas reais.
- O link de valor aberto não recebe o total dinamicamente sem API; o comprador precisa informar o valor correto. Para reduzir risco, a página exibe pedido e total.
- O backend desta versão registra o pedido no Supabase e disponibiliza um endpoint administrativo de confirmação protegido por `ADMIN_SECRET`. Antes de uso, deve-se construir uma tela administrativa autenticada e testar permissões/controle de acesso.
- A rota de confirmação manual não substitui reconciliação bancária; a equipe deve verificar a transação diretamente no painel Mercado Pago.
- O cálculo Loggi ainda é demonstrativo, não uma cotação oficial.
- Tally e Google Sheets ainda não foram conectados. Não coletar dados pessoais até que o fluxo esteja integrado e testado.
- O campo `MP_PAYMENT_LINK` recebe o link oficial de valor aberto. O código ainda não redireciona automaticamente para esse link; isso será ativado após inserir e validar o link e definir como apresentar instrução para digitação do valor.
- Hospedar somente em HTTPS. Não expor service role key ou ADMIN_SECRET no frontend.
- Execute `schema.sql` no Supabase. Atualize a tabela conforme migrations se já houver uma tabela anterior.
