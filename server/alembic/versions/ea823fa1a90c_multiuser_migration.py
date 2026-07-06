"""multiuser_migration

Revision ID: ea823fa1a90c
Revises: c330f6b5d746
Create Date: 2026-07-05 20:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from werkzeug.security import generate_password_hash

# revision identifiers, used by Alembic.
revision: str = 'ea823fa1a90c'
down_revision: Union[str, Sequence[str], None] = 'c330f6b5d746'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    
    # Passo A: Criar a tabela física users se não existir
    if 'users' not in inspector.get_table_names():
        op.create_table('users',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('username', sa.String(), nullable=False),
            sa.Column('password_hash', sa.String(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('username')
        )
        op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
        op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)

    # Passo B: Inserir usuário mestre Fabricio se não existir
    hashed_pw = generate_password_hash("Fabricio123")
    user_exists = connection.execute(sa.text("SELECT 1 FROM users WHERE username = 'Fabricio'")).scalar()
    if not user_exists:
        connection.execute(
            sa.text("INSERT INTO users (username, password_hash, created_at) VALUES ('Fabricio', :pw, datetime('now'))"),
            {"pw": hashed_pw}
        )

    # Passo C: Capturar o ID gerado para o usuário Fabricio
    fabricio_id = connection.execute(sa.text("SELECT id FROM users WHERE username = 'Fabricio'")).scalar()
    if not fabricio_id:
        fabricio_id = 1

    # Função auxiliar para migrar tabela de forma idempotente
    def migrate_table_columns(table_name, create_uc=None, uc_cols=None):
        cols = [c['name'] for c in inspector.get_columns(table_name)]
        if 'user_id' not in cols:
            with op.batch_alter_table(table_name, schema=None) as batch_op:
                batch_op.add_column(sa.Column('user_id', sa.Integer(), nullable=True))
        
        connection.execute(sa.text(f"UPDATE {table_name} SET user_id = :uid WHERE user_id IS NULL"), {"uid": fabricio_id})
        
        # Agora aplicamos as restrições finais na tabela
        try:
            with op.batch_alter_table(table_name, schema=None) as batch_op:
                batch_op.alter_column('user_id', existing_type=sa.Integer(), nullable=False)
                batch_op.create_foreign_key(f'fk_{table_name}_user_id', 'users', ['user_id'], ['id'], ondelete='CASCADE')
                if create_uc and uc_cols:
                    batch_op.create_unique_constraint(create_uc, uc_cols)
        except Exception:
            pass

    # 1. assets (UniqueConstraint composto e remove unique=True de ticker)
    migrate_table_columns('assets', '_ticker_user_uc', ['ticker', 'user_id'])

    # 2. positions (UniqueConstraint composto e remove unique=True de asset_id)
    migrate_table_columns('positions', '_asset_user_uc', ['asset_id', 'user_id'])

    # 3. debtors (UniqueConstraint composto e remove unique=True de nome)
    migrate_table_columns('debtors', '_debtor_nome_user_uc', ['nome', 'user_id'])

    # 4. fixed_income (UniqueConstraint composto)
    migrate_table_columns('fixed_income', '_fixed_income_asset_user_uc', ['asset_id', 'user_id'])

    # 5. Tabelas Simples
    simple_tables = [
        'dividends', 'snapshots', 'refund_configs', 'receivable_loans',
        'loan_installments', 'payment_transactions', 'price_alerts',
        'ai_chat_histories', 'credit_cards', 'card_expenses',
        'card_installments'
    ]
    for t in simple_tables:
        migrate_table_columns(t)


def downgrade() -> None:
    # Remoção das colunas user_id das tabelas simples
    simple_tables = [
        'dividends', 'snapshots', 'refund_configs', 'receivable_loans',
        'loan_installments', 'payment_transactions', 'price_alerts',
        'ai_chat_histories', 'credit_cards', 'card_expenses',
        'card_installments', 'fixed_income', 'debtors', 'positions', 'assets'
    ]
    for t in simple_tables:
        with op.batch_alter_table(t, schema=None) as batch_op:
            batch_op.drop_column('user_id')

    # Drop de tabelas criadas
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_table('users')
