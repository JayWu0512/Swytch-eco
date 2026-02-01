# app/services/vision_service.py
import base64
import json
import re
from openai import OpenAI
from app.core.config import settings


def _to_data_url(image_bytes: bytes, mime_type: str) -> str:
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:{mime_type};base64,{b64}"


def extract_product_json_from_image(image_bytes: bytes, mime_type: str) -> dict:
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    data_url = _to_data_url(image_bytes, mime_type)

    # 強制要求辨識，不准回傳檔名
    prompt = (
        "Identify the product in the image. Return ONLY JSON:\n"
        '{ "name": "detailed name", "category": "category", "material": "material", '
        '"region": "global", "weight_kg": 0.5, "quantity": 1 }\n'
        "NEVER use the filename as the name. If it is a T-shirt, name it 'Cotton T-shirt'."
    )

    response = client.chat.completions.create(
        model="gpt-4o-mini",  # 改用 mini 測試，速度最快
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        max_tokens=300,
    )

    text = response.choices[0].message.content
    print(f"DEBUG: AI identified -> {text}")  # 這裡一定會在終端機印出東西

    clean_json = re.sub(r"```json\s?|\s?```", "", text).strip()
    return json.loads(clean_json)
