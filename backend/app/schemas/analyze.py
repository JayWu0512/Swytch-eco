from pydantic import BaseModel, Field
from typing import Any


class ProductInfo(BaseModel):
    name: str = Field(..., description="Best-guess product name")
    category: str | None = Field(
        default=None, description="e.g. beverage, apparel, electronics"
    )
    material: str | None = Field(
        default=None, description="e.g. plastic, aluminum, paper"
    )

    weight_kg: float | None = Field(default=None, description="Estimated weight in kg")
    quantity: int = Field(default=1, ge=1)

    region: str | None = Field(default="global", description="e.g. US, TW, EU, global")


class ClimatiqEstimate(BaseModel):
    co2e_kg: float
    unit: str = "kgCO2e"
    activity_id: str | None = None
    raw: dict[str, Any] | None = None


class AlternativeItem(BaseModel):
    title: str
    url: str
    source: str | None = None
    estimated_co2e_kg: float | None = None  # optional for future upgrade


class AnalyzeImageResponse(BaseModel):
    product: ProductInfo
    climatiq: ClimatiqEstimate
    alternatives: list[AlternativeItem]
    debug: dict[str, Any] | None = None
