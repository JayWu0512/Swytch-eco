from app.schemas.analyze import ProductInfo


def extract_product_info(
    image_bytes: bytes, filename: str | None = None
) -> ProductInfo:
    """
    MVP stub for image-to-product extraction.

    Later you can replace this with:
    - Vision LLM
    - OCR + classifier
    - Image embedding pipeline
    """

    guessed_name = "unknown-product"
    if filename:
        guessed_name = filename.rsplit(".", 1)[0][:80]

    return ProductInfo(
        name=guessed_name,
        category="unknown",
        material=None,
        weight_kg=None,
        quantity=1,
        region="global",
    )
