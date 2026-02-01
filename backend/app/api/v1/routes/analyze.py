from fastapi import APIRouter, UploadFile, File, HTTPException
from starlette.concurrency import run_in_threadpool

from app.schemas.analyze import (
    AnalyzeImageResponse,
    ClimatiqEstimate,
    AlternativeItem,
)
from app.services.vision_extract import extract_product_info
from app.services.alternatives_search import search_alternatives_from_product

router = APIRouter(tags=["analyze"])


@router.post("/analyze/image", response_model=AnalyzeImageResponse)
async def analyze_image(image: UploadFile = File(...)):
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400, detail="Invalid file type. Please upload an image."
        )

    image_bytes = await image.read()

    # ✅ 建議：extract_product_info 很可能是 CPU/IO heavy（LLM/Vision）
    # 用 threadpool 避免阻塞 async event loop
    product = await run_in_threadpool(
        extract_product_info,
        image_bytes=image_bytes,
        filename=image.filename,
        mime_type=image.content_type or "image/jpeg",
    )

    alternatives, generated_queries, provider = await search_alternatives_from_product(
        product
    )

    # ✅ 防呆：如果 service 某些情況回 dict，就轉成 schema
    normalized_alternatives = []
    for a in alternatives:
        if isinstance(a, dict):
            normalized_alternatives.append(AlternativeItem(**a))
        else:
            normalized_alternatives.append(a)

    return AnalyzeImageResponse(
        product=product,
        climatiq=ClimatiqEstimate(co2e_kg=0.0, activity_id=None, raw=None),
        alternatives=normalized_alternatives,
        debug={
            "mode": "mvp_product_pages_images_no_climatiq",
            "filename": image.filename,
            "generated_queries": generated_queries,
            "search_provider": provider,
        },
    )
