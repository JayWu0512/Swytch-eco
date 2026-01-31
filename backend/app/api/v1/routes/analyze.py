from fastapi import APIRouter, UploadFile, File, HTTPException

from app.schemas.analyze import AnalyzeImageResponse, ClimatiqEstimate
from app.services.vision_extract import extract_product_info
from app.services.alternatives_search import search_alternatives

router = APIRouter(tags=["analyze"])


@router.post("/analyze/image", response_model=AnalyzeImageResponse)
async def analyze_image(image: UploadFile = File(...)):
    # Validate input
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400, detail="Invalid file type. Please upload an image."
        )

    image_bytes = await image.read()

    # 1) Image -> structured product info (stub)
    product = extract_product_info(
        image_bytes=image_bytes,
        filename=image.filename,
    )

    # 2) Find eco-friendly alternatives (stub)
    alternatives = await search_alternatives(
        product_name=product.name,
        region=product.region,
        baseline_co2e_kg=0.0,  # not used in MVP
    )

    # 3) Return response (Climatiq skipped)
    return AnalyzeImageResponse(
        product=product,
        climatiq=ClimatiqEstimate(
            co2e_kg=0.0,
            activity_id=None,
            raw=None,
        ),
        alternatives=alternatives,
        debug={
            "mode": "mvp_no_climatiq",
            "filename": image.filename,
        },
    )
