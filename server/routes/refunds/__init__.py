from flask import Blueprint

refunds_bp = Blueprint('refunds', __name__)

from . import utils, config, debtors, loans, payments, dashboard
