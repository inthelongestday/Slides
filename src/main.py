from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from routers import index, items, auth, slides
from pathlib import Path
from middleware import log_middleware, session_middleware


app = FastAPI()
app.include_router(items.router)
app.include_router(auth.router)
app.include_router(index.router)
app.include_router(slides.router)
app.middleware("http")(session_middleware)
app.middleware("http")(log_middleware)

WEB_DIR = Path(__file__).parent / "web"
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")