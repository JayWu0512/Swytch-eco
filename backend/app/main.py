from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.v1.routes.health import router as health_router
from app.api.v1.routes.analyze import router as analyze_router


def create_app() -> FastAPI:
    app = FastAPI(title=settings.APP_NAME)

    # Allow Chrome extension and local web apps to call the API
    # In production, replace "*" with specific origins (e.g., chrome-extension://<EXT_ID>)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ALLOW_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router, prefix="/api/v1")
    app.include_router(analyze_router, prefix="/api/v1")

    return app


app = create_app()
