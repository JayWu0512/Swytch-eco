from app.schemas.analyze import ProductInfo
from app.services.openai_vision import extract_product_json_from_image


def extract_product_info(
    image_bytes: bytes,
    filename: str | None = None,
    mime_type: str = "image/jpeg",
) -> ProductInfo:
    """
    Image -> ProductInfo
    Uses OpenAI vision. If anything fails, falls back to a safe stub.
    """
    guessed_name = "unknown-product"
    if filename:
        guessed_name = filename.rsplit(".", 1)[0][:80]

    try:
        data = extract_product_json_from_image(
            image_bytes=image_bytes, mime_type=mime_type
        )

        name = data.get("name") or guessed_name
        return ProductInfo(
            name=name,
            category=data.get("category"),
            material=data.get("material"),
            weight_kg=data.get("weight_kg"),
            quantity=data.get("quantity") or 1,
            region=data.get("region") or "global",
        )

    except Exception as e:
        # Fallback to keep the API stable during MVP
        return ProductInfo(
            name=guessed_name,
            category="unknown",
            material=None,
            weight_kg=None,
            quantity=1,
            region="global",
        )
