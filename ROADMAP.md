# 🗺️ Roadmap de Desenvolvimento & Diagnóstico - AssetFlow Pro

Este documento reúne o status de telemetria, bugs resolvidos/conhecidos, backlog de melhorias futuras e o cronograma de releases.

---

## 🐛 Bugs Conhecidos & Mitigações

1 - Sugestao de rebalanceamento quantitavivo está tudo zerado a parte de alocaçao atual

2 - quando peço para atualizar indicadores Yahoo ou sincronizar CVM e da alguem erro por ter algo na esteira de atualizaçao ou outra coisa ele fica rodando infinitamente junto com os avisos na tela e nao tem como fazer mais nada

3 - a parte que fica o nome do assetflow, horario da bolsa, proventos, ferramentas, novo ativo, etc está muito poluida, precisa ajustar

4 - a parte que clico em resumo, açao, fii, internacional, etc. está com muitas funçoes ficando poluida precisa ajustar

5 - na consolidaçao fica a reserva de emergencia e sem ativo se foi pra cima ou pra baixo, como é uma reserva de emergencia a variaçao diaria é algo proximo da selic (é um cdb), precisaria de um visual melhor.

6 - na nova funçao dentro de pronventos eu tenho o yield e consistencia, porem está entrando as coisas de reserva de emergencia, como sao cdbs nao existe yield. tambem o FY forward nao parece seguir o valor real de muitas açaoes, talvez precise revisar.

7 - alguns ativos nao estao buscando o cnpj automaticamente, precisa revisar.

8 - AURE3 esta com alerta de DY zerado. se um ativo nao tiver DY mesmo não é possivel tirar esse alerta, precisamos pensar em uma maneira melhor para tratar isso.

9 - relatorio de sapr4 nao esta sendo sincronizado mesmo com cnpj, precisamos descobrir o motivo.

10 - a central de relatorios patrimoniais esta gerando o relatorio bugado, precisa ajustar.

11 - DCA vs LUMP SUM aparece com erro de comunicaçao com a API do simulador quando coloca qualquer coisa, quando deveria ser um aviso de ticker incorreto ou alguma outra coisa. tambem o nome inicial que aparece é CAIXINHA NUBANK.

12 - existe um fundo gigantesco no drawdown historico nos dias 14/01/2026 até 16/01/2026. isso está correto?

13 - nos desvios de peso e banda de tolerancia, os ativos nao estao levando em consideraçao a porcentagem dentro do grupo deles, precisa revisar e itens que entram em reserva não existe uma meta para cadastrar por ser uma reserva. todo lugar que tiver algo que influencia nisso tem que pensar uma maneira melhor para tratar (ex em consolidaçao acontece a mesma coisa)




---

## 🚀 Melhorias Futuras (Backlog)

1 - existe algum lugar melhor para pegar as imagens dos ativos? a fonte que usamos esta desatualizada e faltando imagens.



## 📅 Histórico de Releases Recentes

* **v1.2.0 (Atual):** Refatoração da camada de chamadas de API do frontend para `apiCall`, implementação de `useTransition` na tabela de busca para mitigar input lag, e implantação de detecção automática de travamento no sentiment checking.
* **v1.1.0:** Lançamento do Agente Jarvis com Function Calling ativo (integração fundamentalista CVM + métricas quantitativas de risco).
* **v1.0.0:** Lançamento da Dashboard do AssetFlow Pro com simulações de Monte Carlo e rebalanceamento de pesos patrimoniais.
