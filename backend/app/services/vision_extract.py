"""
This module converts image bytes into a structured product schema.

For hackathon speed:
- Start with a stub that returns a default ProductInfo.
- Later replace it with your real pipeline:
  - OCR (if needed)
  - Vision LLM extraction
  - Category/material classifier
  - Weight estimation model or heuristic
"""

from app.schemas.analyze import ProductInfo


def extract_product_info(
    image_bytes: bytes, filename: str | None = None
) -> ProductInfo:
    # TODO: Replace with your real vision/LLM extraction
    guessed_name = "unknown-product"
    if filename:
        guessed_name = filename.rsplit(".", 1)[0][:80]

    return ProductInfo(
        name=guessed_name,
        category=None,
        material=None,
        weight_kg=0.2,  # default so the pipeline can run end-to-end
        quantity=1,
        region="global",
    )
