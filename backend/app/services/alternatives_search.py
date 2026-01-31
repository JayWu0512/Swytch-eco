from app.schemas.analyze import AlternativeItem


async def search_alternatives(
    product_name: str,
    region: str | None,
    baseline_co2e_kg: float,
) -> list[AlternativeItem]:
    """
    MVP stub:
    Always return a fixed set of eco-friendly alternatives.
    This avoids external dependencies during early testing.
    """

    return [
        AlternativeItem(
            title="Reusable stainless steel water bottle",
            url="https://example.com/reusable-bottle",
            source="stub",
        ),
        AlternativeItem(
            title="Reusable shopping bag (organic cotton)",
            url="https://example.com/reusable-bag",
            source="stub",
        ),
        AlternativeItem(
            title="Refillable household cleaner system",
            url="https://example.com/refill-cleaner",
            source="stub",
        ),
    ]
