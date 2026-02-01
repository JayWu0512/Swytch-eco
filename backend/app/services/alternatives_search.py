# app/services/alternatives_search.py

from __future__ import annotations
import asyncio
import json
from typing import Optional, List, Dict
from urllib.parse import urljoin
import httpx
from openai import OpenAI
from app.core.config import settings
from app.schemas.analyze import AlternativeItem, ProductInfo

client = OpenAI(api_key=settings.OPENAI_API_KEY)

ECO_STORES = [
    {"name": "earthhero", "base": "https://earthhero.com"},
    {"name": "packagefreeshop", "base": "https://packagefreeshop.com"},
]


async def _get_search_strategy(product: ProductInfo) -> Dict:
    """
    確保 AI 根據辨識出的產品名稱 (product.name) 生成對應的關鍵字
    """
    # 這裡必須把辨識到的產品名稱傳給 AI
    prompt = f"""
    Analyze disposable item: {product.name} ({product.category}). 
    Goal: Find 4 high-quality, reusable replacements.
    
    1. Essence: The functional replacement (e.g., 'reusable cup', 'cotton shirt').
    2. Queries: 4 search terms. One MUST be a single word.
    
    Return JSON:
    {{
        "essence": "travel mug",
        "queries": ["travel mug", "stainless steel tumbler", "ceramic cup", "cup"],
        "required_word": "cup",
        "forbidden": ["menstrual", "soap", "bento"]
    }}
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        # 如果 AI 失敗，則根據 product.name 做基本的降級處理
        print(f"Strategy Error: {e}")
        return {
            "essence": product.name,
            "queries": [product.name, "reusable", "sustainable"],
            "required_word": "",
            "forbidden": [],
        }


async def _fetch_store_data(
    store: dict, query: str, strategy: dict
) -> List[AlternativeItem]:
    url = f"{store['base']}/search/suggest.json"

    # 搜尋回退策略：先搜精確詞，再搜單個核心詞
    search_list = [query]
    if " " in query:
        search_list.append(query.split()[-1])

    async with httpx.AsyncClient(timeout=10) as http_client:
        for q in search_list:
            try:
                params = {
                    "q": q,
                    "resources[type]": "product",
                    "resources[limit]": "10",
                }
                resp = await http_client.get(url, params=params)
                if resp.status_code != 200:
                    continue

                products = (
                    resp.json()
                    .get("resources", {})
                    .get("results", {})
                    .get("products", [])
                )
                if not products:
                    continue

                found = []
                for p in products:
                    title = p.get("title", "").lower()

                    # 1. 黑名單排除
                    if any(f in title for f in strategy["forbidden"]):
                        continue

                    # 2. 相關性評分
                    score = 0
                    if strategy["required_word"].lower() in title:
                        score += 15
                    if any(word in title for word in q.lower().split()):
                        score += 5

                    # 3. 圖片處理
                    img_data = p.get("image") or p.get("featured_image", {})
                    img_url = (
                        img_data
                        if isinstance(img_data, str)
                        else img_data.get("url", "")
                    )
                    if img_url.startswith("//"):
                        img_url = "https:" + img_url

                    item = AlternativeItem(
                        title=p.get("title"),
                        url=urljoin(store["base"], p.get("url")),
                        image_url=img_url or None,
                        source=store["name"],
                    )
                    setattr(item, "_score", score)
                    found.append(item)

                if found:
                    return found
            except:
                continue
    return []


async def search_alternatives_from_product(
    product: ProductInfo,
) -> tuple[list[AlternativeItem], list[str], str]:
    strategy = await _get_search_strategy(product)
    tasks = [
        _fetch_store_data(s, q, strategy)
        for q in strategy["queries"]
        for s in ECO_STORES
    ]
    results = await asyncio.gather(*tasks)

    candidates = []
    seen_urls = set()
    for sublist in results:
        for item in sublist:
            if item.url not in seen_urls:
                candidates.append(item)
                seen_urls.add(item.url)

    candidates.sort(key=lambda x: getattr(x, "_score", 0), reverse=True)

    # 品牌去重與數量控制
    final = []
    seen_brands = set()
    for item in candidates:
        brand = " ".join(item.title.split()[:2]).lower()
        if brand in seen_brands and len(final) < 2:
            continue
        final.append(item)
        seen_brands.add(brand)
        if len(final) >= 5:
            break

    # 補足 5 個，若真的沒東西則進保底
    if not final:
        final = [
            AlternativeItem(
                title=f"Durable {product.name} Alternative",
                url=f"https://earthhero.com/search?q={strategy['queries'][0]}",
                image_url="https://earthhero.com/cdn/shop/files/EarthHero-Zero-Waste-Essentials-Gift-Box-1_800x.jpg",
                source="recommendation",
            )
        ]
    elif len(final) < 5:
        for item in candidates:
            if item not in final:
                final.append(item)
                if len(final) >= 5:
                    break

    return (
        final[:5],
        strategy["queries"],
        "+".join(list(set(it.source for it in final))),
    )
