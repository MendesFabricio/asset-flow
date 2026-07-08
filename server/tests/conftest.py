import sys
import os

# Adiciona o diretório pai (server/) ao sys.path para que importações relativas funcionem no pytest
parent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)
