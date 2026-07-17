from db import db_log, db_sessions
from datetime import datetime
from fastapi import Request
from pydantic import BaseModel
from starlette.responses import JSONResponse

import time

class Log(BaseModel):
    method: str = ""
    url: str = ""
    client_host: str = ""
    client_port: int = 0
    elapsed_time: float = 0.0
    status: int = 0
    path_params: dict = {}
    query_params: dict = {}

    def print_log(self):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print("[{ts}]", "[Server Log]", self.method, self.url, "| status:", self.status, "| client:", f'{self.client_host}:{self.client_port}', "| elapsed time:", f'{round(self.elapsed_time*1000, 2)}ms')


async def log_middleware(request: Request, call_next):

    log = Log()
    log.method = request.method
    log.url = str(request.url)
    log.client_host = request.client.host
    log.client_port = request.client.port
    log.path_params = request.path_params
    log.query_params = dict(request.query_params)
    
    start = time.time()

    response = await call_next(request)

    elapsed_time = time.time() - start
    
    log.elapsed_time = elapsed_time
    log.status = response.status_code

    db_log.append(log)
    log.print_log()
    
    return response


async def session_middleware(request: Request, call_next):
    cookies = request.cookies
    path = str(request.url.path)
    method = str(request.method)

    no_session = False

    if method == "GET" or path == "/api/auth/login":
        no_session = True

    if not no_session:
        if "session_id" in cookies:
            session_id = cookies["session_id"]
            if session_id not in db_sessions:
                return JSONResponse(
                    status_code=401, 
                    content={"detail": "Unauthorized Access. No valid session id."}
                )
        else:
            return JSONResponse(
                status_code=401, 
                content={"detail": "Unauthorized Access. No valid session id."}
            )
        print("[Server Log] Session Id Validated.")
    
    response = await call_next(request)

    return response
