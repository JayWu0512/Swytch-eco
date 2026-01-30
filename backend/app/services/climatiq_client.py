import httpx
from app.core.config import settings


class ClimatiqClient:
    def __init__(self):
        if not settings.CLIMATIQ_API_KEY:
            raise RuntimeError(
                "CLIMATIQ_API_KEY is not set. Please configure it in .env."
            )

        self.base_url = settings.CLIMATIQ_BASE_URL.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {settings.CLIMATIQ_API_KEY}",
            "Content-Type": "application/json",
        }

    async def search_activity(self, query: str) -> dict:
        url = f"{self.base_url}/data/v1/search"
        params = {"query": query, "page": 1, "results_per_page": 1}

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url, headers=self.headers, params=params)
            resp.raise_for_status()
            return resp.json()

    async def estimate(self, activity_id: str, parameters: dict) -> dict:
        url = f"{self.base_url}/data/v1/estimate"
        payload = {
            "emission_factor": {"activity_id": activity_id},
            "parameters": parameters,
        }

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(url, headers=self.headers, json=payload)
            resp.raise_for_status()
            return resp.json()
