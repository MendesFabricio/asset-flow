# server/services_modules/categories.py
from decimal import Decimal
from db.models import Category, safe_commit
from db.session import Session

class CategoryService:
    def update_category_meta(self, category_name, new_meta):
        with Session() as session:
            try:
                cat = session.query(Category).filter_by(name=category_name).first()
                if not cat: 
                    raise ValueError("Categoria não encontrada")
                cat.target_percent = Decimal(str(new_meta))
                safe_commit(session)
                return "Meta atualizada!"
            except Exception:
                session.rollback()
                raise
