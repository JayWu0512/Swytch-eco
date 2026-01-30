"""
Alternative search module.

Hackathon version:
- Use a search API (SerpAPI) to get candidate URLs quickly.

Upgrade version (recommended):
- For each candidate URL:
  - fetch product page text
  - extract ProductInfo again
  - estimate CO2e again
  - rank by CO2e and return only "lower than baseline"
"""

import httpx
from app.core.config import settings
from app.schemas.analyze import AlternativeItem


async def search_alternatives(
    product_name: str, region: str | None, baseline_co2e_kg: float
) -> list[AlternativeItem]:
    query = f"{product_name} low carbon alternative reusable sustainable"

    if settings.SERPAPI_KEY:
        return await _search_serpapi(query)

    return []


async def _search_serpapi(query: str) -> list[AlternativeItem]:
    url = "https://serpapi.com/search.json"
    params = {
        "engine": "google",
        "q": query,
        "api_key": settings.SERPAPI_KEY,
        "num": 5,
    }

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    items: list[AlternativeItem] = []
    for it in (data.get("organic_results") or [])[:5]:
        link = it.get("link")
        title = it.get("title") or "Alternative"
        if link:
            items.append(AlternativeItem(title=title, url=link, source="serpapi"))
    return items
