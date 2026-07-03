# 🗺️ Roadmap de Desenvolvimento & Diagnóstico - AssetFlow Pro

Este documento reúne o status de telemetria, bugs resolvidos/conhecidos, backlog de melhorias futuras e o cronograma de releases.

---

## 🐛 Bugs Conhecidos & Mitigações

1 - Proventos não esta pegando nada e nao tem nada no historico tambem (parece que nao esta carregando)
2 - na consolidaçao mudar a ordem para algo que faz mais sentido e a reserva nao ficar no meio
3 - frontend travou e só fica carregando depois que fui pra ferramenta de proventos


---

## 🚀 Melhorias Futuras (Backlog)

1 - existe algum lugar melhor para pegar as imagens dos ativos? a fonte que usamos esta desatualizada e faltando imagens.



## 📅 Histórico de Releases Recentes

* **v1.2.0 (Atual):** Refatoração da camada de chamadas de API do frontend para `apiCall`, implementação de `useTransition` na tabela de busca para mitigar input lag, e implantação de detecção automática de travamento no sentiment checking.
* **v1.1.0:** Lançamento do Agente Jarvis com Function Calling ativo (integração fundamentalista CVM + métricas quantitativas de risco).
* **v1.0.0:** Lançamento da Dashboard do AssetFlow Pro com simulações de Monte Carlo e rebalanceamento de pesos patrimoniais.
