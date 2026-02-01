# app/services/openai_alternatives.py

import json
import re
import os
from openai import OpenAI

from app.core.config import settings
from app.schemas.analyze import ProductInfo


def _shop_domain_seeds() -> list[str]:
    raw = os.getenv("SHOP_DOMAIN_WHITELIST", "").strip()
    if raw:
        parts = [
            p.strip().lower().replace("www.", "") for p in raw.split(",") if p.strip()
        ]
        return parts[:6]
    # fallback seeds
    return ["keepcup.com", "sttoke.com", "kleankanteen.com", "hydroflask.com"]


def _fallback_queries(product: ProductInfo, max_queries: int) -> list[str]:
    seeds = _shop_domain_seeds()

    # ✅ 至少一條用 site: 命中白名單域名
    q1 = (
        f"buy reusable coffee cup site:{seeds[0]} -review -best -top -guide -blog -list"
    )
    q2 = f"shop stainless steel travel mug price -review -best -top -guide -blog -list"
    q3 = f"buy glass coffee tumbler plastic-free official store -review -best -top -guide -blog -list"

    base = [q1, q2, q3]
    return base[:max_queries]


def _extract_json_object(text: str) -> str | None:
    if not text:
        return None
    m = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not m:
        return None
    return m.group(0)


def generate_eco_search_queries(
    product: ProductInfo, max_queries: int = 3
) -> list[str]:
    if not settings.OPENAI_API_KEY:
        return _fallback_queries(product, max_queries)

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    seeds = _shop_domain_seeds()

    prompt = (
        "You are a shopping assistant.\n"
        "Your goal is to find ECO-FRIENDLY ALTERNATIVES to the given product.\n"
        "The results should be PRODUCT PAGES (official store / shop pages), not articles.\n"
        "Return ONLY valid JSON:\n"
        '{ "queries": ["...", "..."] }\n'
        "Rules:\n"
        f"- Provide exactly {max_queries} queries.\n"
        "- Focus on reusable/refillable/durable alternatives (NOT the original disposable item).\n"
        "- Each query must include shopping intent words: buy OR shop OR official store OR price.\n"
        "- Each query must include eco keywords: reusable OR stainless steel OR glass OR plastic-free.\n"
        "- Add negative keywords to avoid articles: -review -best -top -guide -blog -list.\n"
        f"- At least 1 query MUST use site: with one of these domains: {', '.join(seeds[:4])}\n"
        "- Keep each query short.\n"
    )

    user_content = (
        f"Product name: {product.name}\n"
        f"Category: {product.category}\n"
        f"Material: {product.material}\n"
        f"Region: {product.region}\n"
        "Find eco-friendly alternatives people can purchase.\n"
    )

    try:
        resp = client.responses.create(
            model=settings.OPENAI_MODEL,
            input=[
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {"type": "input_text", "text": user_content},
                    ],
                }
            ],
        )

        text = getattr(resp, "output_text", None) or ""
        if not text:
            try:
                text = resp.output[0].content[0].text  # type: ignore[attr-defined]
            except Exception:
                text = ""

        json_str = _extract_json_object(text) or ""
        data = json.loads(json_str) if json_str else {}
        queries = data.get("queries") or []

        cleaned: list[str] = []
        for q in queries:
            if isinstance(q, str):
                q = q.strip()
                if q and q not in cleaned:
                    cleaned.append(q)

        return (
            cleaned[:max_queries]
            if cleaned
            else _fallback_queries(product, max_queries)
        )

    except Exception:
        return _fallback_queries(product, max_queries)
