import logging
import re

from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector, TrigramSimilarity
from django.db import connection
from django.db.models import Case, ExpressionWrapper, FloatField, Q, Value, When
from django.db.models.functions import Coalesce
from django.db.utils import DatabaseError, OperationalError, ProgrammingError


logger = logging.getLogger(__name__)

TERM_PATTERN = re.compile(r"[a-z0-9\u0600-\u06FF]+", re.IGNORECASE)

SEARCH_FIELDS = (
    "name_en",
    "name_ar",
    "short_description_en",
    "short_description_ar",
    "description_en",
    "description_ar",
    "brand",
    "slug",
    "categories__name_en",
    "categories__name_ar",
    "categories__slug",
    "tags__name_en",
    "tags__name_ar",
    "tags__slug",
)

SYNONYM_GROUPS = (
    {"baby", "infant"},
    {"lotion", "cream"},
    {"organic", "natural"},
    {"wash", "shampoo"},
    {"طفل", "رضيع"},
    {"لوشن", "كريم"},
    {"عضوي", "طبيعي"},
    {"غسول", "شامبو"},
)

SYNONYM_LOOKUP = {}
for group in SYNONYM_GROUPS:
    for term in group:
        SYNONYM_LOOKUP[term] = sorted(item for item in group if item != term)


def _unique_preserving_order(values):
    seen = set()
    result = []
    for value in values:
        normalized = str(value or "").strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def expand_search_terms(query):
    text = str(query or "").strip().lower()
    if not text:
        return []

    terms = [text]
    tokens = TERM_PATTERN.findall(text)
    for token in tokens:
        terms.append(token)
        terms.extend(SYNONYM_LOOKUP.get(token, []))

    return _unique_preserving_order(terms)[:16]


def build_search_filter(terms):
    filters = Q()
    for term in terms:
        term_filter = Q()
        for field in SEARCH_FIELDS:
            term_filter |= Q(**{f"{field}__icontains": term})
        filters |= term_filter
    return filters


def _is_postgres():
    return connection.vendor == "postgresql"


def _postgres_has_trigram():
    if not _is_postgres():
        return False
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')"
            )
            row = cursor.fetchone() or [False]
            return bool(row[0])
    except (DatabaseError, OperationalError):
        return False


def _fallback_rank_expression(terms):
    score = Value(0.0, output_field=FloatField())
    for term in terms:
        score = score + Case(
            When(name_en__iexact=term, then=Value(22.0)),
            default=Value(0.0),
            output_field=FloatField(),
        )
        score = score + Case(
            When(name_ar__iexact=term, then=Value(22.0)),
            default=Value(0.0),
            output_field=FloatField(),
        )
        score = score + Case(
            When(name_en__istartswith=term, then=Value(12.0)),
            default=Value(0.0),
            output_field=FloatField(),
        )
        score = score + Case(
            When(name_ar__istartswith=term, then=Value(12.0)),
            default=Value(0.0),
            output_field=FloatField(),
        )
        score = score + Case(
            When(categories__name_en__icontains=term, then=Value(7.0)),
            default=Value(0.0),
            output_field=FloatField(),
        )
        score = score + Case(
            When(categories__name_ar__icontains=term, then=Value(7.0)),
            default=Value(0.0),
            output_field=FloatField(),
        )
        score = score + Case(
            When(tags__name_en__icontains=term, then=Value(6.0)),
            default=Value(0.0),
            output_field=FloatField(),
        )
        score = score + Case(
            When(tags__name_ar__icontains=term, then=Value(6.0)),
            default=Value(0.0),
            output_field=FloatField(),
        )
        score = score + Case(
            When(short_description_en__icontains=term, then=Value(4.0)),
            default=Value(0.0),
            output_field=FloatField(),
        )
        score = score + Case(
            When(short_description_ar__icontains=term, then=Value(4.0)),
            default=Value(0.0),
            output_field=FloatField(),
        )
        score = score + Case(
            When(description_en__icontains=term, then=Value(2.5)),
            default=Value(0.0),
            output_field=FloatField(),
        )
        score = score + Case(
            When(description_ar__icontains=term, then=Value(2.5)),
            default=Value(0.0),
            output_field=FloatField(),
        )
    return score


def _apply_fallback_search(queryset, query):
    terms = expand_search_terms(query)
    if not terms:
        return queryset

    search_filter = build_search_filter(terms)
    rank_expression = _fallback_rank_expression(terms)
    return queryset.filter(search_filter).annotate(search_rank=rank_expression).order_by(
        "-search_rank", "sort_order", "id"
    )


def _build_postgres_query(terms):
    search_query = None
    for term in terms:
        token_query = SearchQuery(term, search_type="plain", config="simple")
        search_query = token_query if search_query is None else (search_query | token_query)
    return search_query


def _build_trigram_expression(query):
    return (
        Coalesce(TrigramSimilarity("name_en", query), Value(0.0))
        + Coalesce(TrigramSimilarity("name_ar", query), Value(0.0))
        + Coalesce(TrigramSimilarity("short_description_en", query), Value(0.0))
        + Coalesce(TrigramSimilarity("short_description_ar", query), Value(0.0))
        + Coalesce(TrigramSimilarity("categories__name_en", query), Value(0.0))
        + Coalesce(TrigramSimilarity("categories__name_ar", query), Value(0.0))
    )


def _apply_postgres_search(queryset, query):
    terms = expand_search_terms(query)
    if not terms:
        return queryset

    search_filter = build_search_filter(terms)
    vector = (
        SearchVector("name_en", weight="A", config="simple")
        + SearchVector("name_ar", weight="A", config="simple")
        + SearchVector("categories__name_en", weight="A", config="simple")
        + SearchVector("categories__name_ar", weight="A", config="simple")
        + SearchVector("tags__name_en", weight="B", config="simple")
        + SearchVector("tags__name_ar", weight="B", config="simple")
        + SearchVector("short_description_en", weight="C", config="simple")
        + SearchVector("short_description_ar", weight="C", config="simple")
        + SearchVector("description_en", weight="D", config="simple")
        + SearchVector("description_ar", weight="D", config="simple")
    )
    search_query = _build_postgres_query(terms)
    queryset = queryset.annotate(fts_rank=SearchRank(vector, search_query))

    if _postgres_has_trigram():
        trigram_expression = _build_trigram_expression(str(query or "").strip())
        queryset = queryset.annotate(
            trigram_rank=trigram_expression,
            search_rank=ExpressionWrapper(
                (Coalesce(SearchRank(vector, search_query), Value(0.0)) * Value(0.7))
                + (Coalesce(trigram_expression, Value(0.0)) * Value(0.3)),
                output_field=FloatField(),
            ),
        ).filter(
            Q(fts_rank__gt=0.0) | Q(trigram_rank__gte=0.12) | search_filter
        ).order_by("-search_rank", "-fts_rank", "-trigram_rank", "sort_order", "id")
        return queryset

    queryset = queryset.annotate(
        search_rank=ExpressionWrapper(
            Coalesce(SearchRank(vector, search_query), Value(0.0)),
            output_field=FloatField(),
        )
    ).filter(Q(fts_rank__gt=0.0) | search_filter).order_by(
        "-search_rank", "-fts_rank", "sort_order", "id"
    )
    return queryset


def apply_ranked_product_search(queryset, query):
    text = str(query or "").strip()
    if not text:
        return queryset

    if not _is_postgres():
        return _apply_fallback_search(queryset, text)

    try:
        return _apply_postgres_search(queryset, text)
    except (DatabaseError, OperationalError, ProgrammingError) as exc:
        logger.warning(
            "PostgreSQL search unavailable, using fallback search: %s",
            exc,
        )
        return _apply_fallback_search(queryset, text)
