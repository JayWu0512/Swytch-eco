from fastapi import APIRouter, UploadFile, File, HTTPException

from app.core.config import settings
from app.schemas.analyze import AnalyzeImageResponse, ClimatiqEstimate
from app.services.vision_extract import extract_product_info
from app.services.climatiq_client import ClimatiqClient
from app.services.alternatives_search import search_alternatives


router = APIRouter(tags=["analyze"])


@router.post("/analyze/image", response_model=AnalyzeImageResponse)
async def analyze_image(image: UploadFile = File(...)):
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400, detail="Invalid file type. Please upload an image."
        )

    image_bytes = await image.read()

    # 1) Image -> structured product info
    product = extract_product_info(image_bytes=image_bytes, filename=image.filename)

    # 2) Climatiq estimation
    client = ClimatiqClient()

    search_res = await client.search_activity(query=product.name)
    results = search_res.get("results") or []
    if not results:
        raise HTTPException(
            status_code=404, detail="No Climatiq emission factor found for this query."
        )

    activity_id = results[0].get("activity_id")
    if not activity_id:
        raise HTTPException(
            status_code=500, detail="Climatiq search result missing activity_id."
        )

    if not product.weight_kg:
        raise HTTPException(
            status_code=400, detail="Missing weight_kg. Cannot estimate CO2e yet."
        )

    parameters = {
        "weight": product.weight_kg * product.quantity,
        "weight_unit": "kg",
    }

    estimate_res = await client.estimate(activity_id=activity_id, parameters=parameters)
    co2e_kg = float(estimate_res.get("co2e", 0.0))

    climatiq_out = ClimatiqEstimate(
        co2e_kg=co2e_kg,
        activity_id=activity_id,
        raw=estimate_res if settings.RETURN_DEBUG else None,
    )

    # 3) Find alternatives (candidate URLs)
    alternatives = await search_alternatives(
        product_name=product.name,
        region=product.region,
        baseline_co2e_kg=co2e_kg,
    )

    debug = None
    if settings.RETURN_DEBUG:
        debug = {
            "climatiq_search_top": results[0],
            "climatiq_parameters": parameters,
        }

    return AnalyzeImageResponse(
        product=product,
        climatiq=climatiq_out,
        alternatives=alternatives,
        debug=debug,
    )
