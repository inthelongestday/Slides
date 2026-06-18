from fastapi import FastAPI
from routers import items, auth
from middleware import log_middleware, session_middleware

app = FastAPI()
app.include_router(items.router)
app.include_router(auth.router)
app.middleware("http")(session_middleware)
app.middleware("http")(log_middleware)
