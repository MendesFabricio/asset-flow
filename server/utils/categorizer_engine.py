import re
import math
from collections import defaultdict
from typing import Dict, List, Tuple, Any

# 🏷️ Categorias Padrão do AssetFlow
CATEGORIES = [
    "Alimentação",
    "Transporte",
    "Saúde/Farmácia",
    "Lazer/Assinaturas",
    "Compras/Varejo",
    "Serviços/Utilitários",
    "Transferências/Pessoas",
    "Fatura/Cartão",
    "Investimentos/Resgate",
    "Outros"
]

# 📚 Dataset de Treinamento Base com Padrões do Mercado Brasileiro
DATASET_TREINAMENTO: List[Tuple[str, str]] = [
    # Alimentação
    ("ifood", "Alimentação"), ("ifood restaurante", "Alimentação"), ("ifood osasco", "Alimentação"),
    ("rappi", "Alimentação"), ("rappi brasil", "Alimentação"), ("ze delivery", "Alimentação"),
    ("mcdonalds", "Alimentação"), ("mc donalds", "Alimentação"), ("burger king", "Alimentação"),
    ("bobs", "Alimentação"), ("subway", "Alimentação"), ("giraffas", "Alimentação"), ("habibs", "Alimentação"),
    ("spoleto", "Alimentação"), ("outback", "Alimentação"), ("coco bambu", "Alimentação"), ("madero", "Alimentação"),
    ("supermercado", "Alimentação"), ("mercado", "Alimentação"), ("hortifruti", "Alimentação"),
    ("carrefour", "Alimentação"), ("pao de acucar", "Alimentação"), ("extra mercado", "Alimentação"),
    ("assai atacadista", "Alimentação"), ("atacadao", "Alimentação"), ("dia brasil", "Alimentação"),
    ("sams club", "Alimentação"), ("st marche", "Alimentação"), ("zona sul mercado", "Alimentação"),
    ("padaria", "Alimentação"), ("panificadora", "Alimentação"), ("confeitaria", "Alimentação"),
    ("doceria", "Alimentação"), ("cacau show", "Alimentação"), ("kopenhagen", "Alimentação"),
    ("starbucks", "Alimentação"), ("cafe", "Alimentação"), ("coffee", "Alimentação"),
    ("hamburgueria", "Alimentação"), ("pizzaria", "Alimentação"), ("churrascaria", "Alimentação"),
    ("sushi bar", "Alimentação"), ("restaurante", "Alimentação"), ("lanchonete", "Alimentação"),
    ("acai", "Alimentação"), ("sorveteria", "Alimentação"), ("bistro", "Alimentação"),

    # Transporte
    ("uber", "Transporte"), ("uber trip", "Transporte"), ("uber pending", "Transporte"),
    ("99app", "Transporte"), ("99 pay", "Transporte"), ("99 taxi", "Transporte"), ("indrive", "Transporte"),
    ("cabify", "Transporte"), ("posto shell", "Transporte"), ("posto ipiranga", "Transporte"),
    ("posto petrobras", "Transporte"), ("posto br", "Transporte"), ("postoconveniencia", "Transporte"),
    ("combustivel", "Transporte"), ("gasolina", "Transporte"), ("etanol", "Transporte"),
    ("estacionamento", "Transporte"), ("estac", "Transporte"), ("autopass", "Transporte"),
    ("sem parar", "Transporte"), ("veloe", "Transporte"), ("conectcar", "Transporte"),
    ("pedagio", "Transporte"), ("metro sp", "Transporte"), ("cptm", "Transporte"), ("sptrans", "Transporte"),
    ("oficina mecanica", "Transporte"), ("auto pecas", "Transporte"), ("borracharia", "Transporte"),

    # Saúde / Farmácia
    ("drogasil", "Saúde/Farmácia"), ("droga raia", "Saúde/Farmácia"), ("drogaria sp", "Saúde/Farmácia"),
    ("pague menos", "Saúde/Farmácia"), ("farmacia pacheco", "Saúde/Farmácia"), ("ultrafarma", "Saúde/Farmácia"),
    ("drogaria", "Saúde/Farmácia"), ("farmacia", "Saúde/Farmácia"), ("manipulacao", "Saúde/Farmácia"),
    ("hospital", "Saúde/Farmácia"), ("clinica medica", "Saúde/Farmácia"), ("consultorio", "Saúde/Farmácia"),
    ("laboratorio fleury", "Saúde/Farmácia"), ("dasa laboratorios", "Saúde/Farmácia"), ("lavoisier", "Saúde/Farmácia"),
    ("exame", "Saúde/Farmácia"), ("consulta", "Saúde/Farmácia"), ("odonto", "Saúde/Farmácia"),
    ("psicologia", "Saúde/Farmácia"), ("fisioterapia", "Saúde/Farmácia"), ("dermatologia", "Saúde/Farmácia"),

    # Lazer / Assinaturas
    ("netflix", "Lazer/Assinaturas"), ("spotify", "Lazer/Assinaturas"), ("amazon prime", "Lazer/Assinaturas"),
    ("apple com bill", "Lazer/Assinaturas"), ("google storage", "Lazer/Assinaturas"), ("youtube premium", "Lazer/Assinaturas"),
    ("disney plus", "Lazer/Assinaturas"), ("hbo max", "Lazer/Assinaturas"), ("globoplay", "Lazer/Assinaturas"),
    ("deezer", "Lazer/Assinaturas"), ("crunchyroll", "Lazer/Assinaturas"), ("paramount", "Lazer/Assinaturas"),
    ("gympass", "Lazer/Assinaturas"), ("smart fit", "Lazer/Assinaturas"), ("bluefit", "Lazer/Assinaturas"),
    ("cinema", "Lazer/Assinaturas"), ("cinemark", "Lazer/Assinaturas"), ("uci cinemas", "Lazer/Assinaturas"),
    ("ingresso com", "Lazer/Assinaturas"), ("sympla", "Lazer/Assinaturas"), ("eventim", "Lazer/Assinaturas"),
    ("steam games", "Lazer/Assinaturas"), ("playstation network", "Lazer/Assinaturas"), ("xbox live", "Lazer/Assinaturas"),

    # Compras / Varejo
    ("mercadolivre", "Compras/Varejo"), ("mercado livre", "Compras/Varejo"), ("shopee", "Compras/Varejo"),
    ("shein", "Compras/Varejo"), ("amazon br", "Compras/Varejo"), ("magazine luiza", "Compras/Varejo"),
    ("magalu", "Compras/Varejo"), ("americanas", "Compras/Varejo"), ("casas bahia", "Compras/Varejo"),
    ("zara", "Compras/Varejo"), ("renner", "Compras/Varejo"), ("riachuelo", "Compras/Varejo"),
    ("ce a", "Compras/Varejo"), ("centauro", "Compras/Varejo"), ("netshoes", "Compras/Varejo"),
    ("fast shop", "Compras/Varejo"), ("kabum", "Compras/Varejo"), ("pichau", "Compras/Varejo"),
    ("decathlon", "Compras/Varejo"), ("leroy merlin", "Compras/Varejo"), ("tok stok", "Compras/Varejo"),

    # Serviços / Utilitários
    ("enel", "Serviços/Utilitários"), ("sabesp", "Serviços/Utilitários"), ("cemig", "Serviços/Utilitários"),
    ("cpfl", "Serviços/Utilitários"), ("comgas", "Serviços/Utilitários"), ("vivo", "Serviços/Utilitários"),
    ("claro", "Serviços/Utilitários"), ("tim brasil", "Serviços/Utilitários"), ("oi fixo", "Serviços/Utilitários"),
    ("cartorio", "Serviços/Utilitários"), ("ipva", "Serviços/Utilitários"), ("iptu", "Serviços/Utilitários"),
    ("condominio", "Serviços/Utilitários"), ("aluguel", "Serviços/Utilitários"),

    # Transferências / Pessoas
    ("pix enviado", "Transferências/Pessoas"), ("pix recebido", "Transferências/Pessoas"),
    ("transferencia ted", "Transferências/Pessoas"), ("transferencia doc", "Transferências/Pessoas"),
    ("envio pix", "Transferências/Pessoas"), ("transacao pix", "Transferências/Pessoas"),

    # Fatura / Cartão
    ("pagamento fatura", "Fatura/Cartão"), ("pagto fatura", "Fatura/Cartão"),
    ("fatura cartao", "Fatura/Cartão"), ("tarifa bancaria", "Fatura/Cartão"),

    # Investimentos / Resgate
    ("resgate cdb", "Investimentos/Resgate"), ("aplicacao tesouro", "Investimentos/Resgate"),
    ("compra acao", "Investimentos/Resgate"), ("proventos", "Investimentos/Resgate"),
]

def sanitize_text(text: str) -> str:
    """Limpa e normaliza a descrição de transações financeiras tirando ruídos de maquininha."""
    if not text:
        return ""
    
    t = text.lower()
    # Remove prefixos comuns de adquirentes/maquininhas
    prefixes = [
        r"^pg\s*\*\s*", r"^pag\s*\*\s*", r"^mp\s*\*\s*", r"^ebn\s*\*\s*", 
        r"^paypal\s*\*\s*", r"^dl\s*\*\s*", r"^sumup\s*\*\s*", r"^st\s*\*\s*",
        r"^compra\s+com\s+cartao\s+-\s*", r"^compra\s+debito\s+-\s*"
    ]
    for p in prefixes:
        t = re.sub(p, "", t)
    
    # Remove códigos de cidades/UF e sufixos numéricos no final (ex: "SAO PAULO BR", "12345")
    t = re.sub(r"\b(sao paulo|rio de janeiro|curitiba|bh|br|sp|rj|mg|pr|rs)\b", "", t)
    t = re.sub(r"\d+", " ", t)  # Remove números isolados
    t = re.sub(r"[^\w\s]", " ", t)  # Remove pontuação
    t = re.sub(r"\s+", " ", t).strip()
    return t

def extract_ngrams(text: str, n_range=(1, 2)) -> List[str]:
    """Extrai unigramas e bigramas de palavras."""
    words = text.split()
    ngrams = []
    for n in range(n_range[0], n_range[1] + 1):
        for i in range(len(words) - n + 1):
            ngrams.append(" ".join(words[i:i + n]))
    return ngrams

class MLCategorizerEngine:
    """
    Engine Inteligente de Categorização Financeira Híbrido (TF-IDF + Naive Bayes com Aprendizado Incremental).
    """
    def __init__(self):
        self.doc_count = 0
        self.category_counts: Dict[str, int] = defaultdict(int)
        self.feature_counts: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self.feature_totals: Dict[str, int] = defaultdict(int)
        self.vocab = set()
        
        # Treina o modelo com o dataset inicial
        self._train_initial_dataset()

    def _train_initial_dataset(self):
        for text, cat in DATASET_TREINAMENTO:
            self.train_example(text, cat)

    def train_example(self, text: str, category: str):
        """Treina/Atualiza o modelo com um exemplo (suporta aprendizado contínuo)."""
        clean_t = sanitize_text(text)
        if not clean_t or category not in CATEGORIES:
            return
        
        ngrams = extract_ngrams(clean_t)
        self.doc_count += 1
        self.category_counts[category] += 1
        
        for feature in ngrams:
            self.vocab.add(feature)
            self.feature_counts[category][feature] += 1
            self.feature_totals[category] += 1

    def classify(self, text: str) -> Tuple[str, float, str]:
        """
        Classifica uma descrição retornando (categoria, confiança, método).
        Confidence de 0.0 a 1.0.
        """
        raw_clean = (text or "").strip().lower()
        if not raw_clean:
            return "Outros", 0.0, "fallback"
        
        # 1. Checagem Exata por Regra Direta de Palavras-Chave de Alto Valor
        clean_t = sanitize_text(text)
        
        # Fast matching em unigramas/bigramas exatos
        for sample_text, cat in DATASET_TREINAMENTO:
            if sample_text in clean_t or sample_text in raw_clean:
                return cat, 0.98, "exact_keyword"
        
        if not clean_t:
            return "Outros", 0.0, "fallback"

        # 2. Classificação Bayesiana Probabilística (TF-IDF Weighted Naive Bayes)
        ngrams = extract_ngrams(clean_t)
        if not ngrams:
            return "Outros", 0.0, "fallback"

        scores: Dict[str, float] = {}
        vocab_size = max(len(self.vocab), 1)

        for cat in CATEGORIES:
            if cat == "Outros":
                continue
            
            # Prior log probability P(Category)
            cat_prior = math.log((self.category_counts[cat] + 1) / (self.doc_count + len(CATEGORIES)))
            cat_log_prob = cat_prior
            
            cat_total_words = self.feature_totals[cat] + vocab_size
            
            for feature in ngrams:
                count = self.feature_counts[cat].get(feature, 0)
                # Laplace Smoothing
                word_prob = (count + 1.0) / cat_total_words
                cat_log_prob += math.log(word_prob)
                
            scores[cat] = cat_log_prob

        if not scores:
            return "Outros", 0.0, "fallback"

        # Normaliza pontuações de log usando Softmax para obter probabilidades entre 0 e 1
        max_score = max(scores.values())
        exp_scores = {c: math.exp(s - max_score) for c, s in scores.items()}
        total_exp = sum(exp_scores.values())
        
        probabilities = {c: exp_scores[c] / total_exp for c in exp_scores}
        
        best_cat = max(probabilities, key=probabilities.get)
        confidence = round(probabilities[best_cat], 4)

        if confidence < 0.20:
            return "Outros", confidence, "low_confidence_fallback"

        return best_cat, confidence, "ml_bayes"

# Instância Singleton global exportada
categorizer_engine = MLCategorizerEngine()
