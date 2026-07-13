#!/bin/bash
echo -e "\e[33mLimpando sistema Docker...\e[0m"
docker system prune -f
docker volume prune -f
echo -e "\e[32mLimpeza concluída.\e[0m"
