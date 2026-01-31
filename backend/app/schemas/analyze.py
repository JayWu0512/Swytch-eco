from pydantic import BaseModel
from typing import Any


class ProductInfo(BaseModel):
    name: str
    category: str | None = None
    material: str | None = None
    weight_kg: float | None = None
    quantity: int = 1
    region: str | None = "global"


class ClimatiqEstimate(BaseModel):
    co2e_kg: float
    unit: str = "kgCO2e"
    activity_id: str | None = None
    raw: dict[str, Any] | None = None


class AlternativeItem(BaseModel):
    title: str
    url: str
    source: str | None = None


class AnalyzeImageResponse(BaseModel):
    product: ProductInfo
    climatiq: ClimatiqEstimate
    alternatives: list[AlternativeItem]
    debug: dict[str, Any] | None = None
