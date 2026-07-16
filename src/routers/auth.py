from db import owner_pw, db_sessions
from fastapi import APIRouter, HTTPException, Response, Cookie
from pydantic import BaseModel

import uuid


class Login(BaseModel):
    password: str


router = APIRouter()

def generate_unique_session_id():
    id = uuid.uuid4()

    # 이미 db_sessions 안에 있는 session_id의 경우 새로 uuid 발급
    while id in db_sessions:
        id = uuid.uuid4()
    
    return str(id)

# login
@router.post("/auth/login")
def login(response: Response, info: Login):
    pw = info.password
    if pw == owner_pw:
            session_id = generate_unique_session_id()
            db_sessions[session_id] = "owner"
            
            response.set_cookie(key="session_id", value=session_id)
            return {"message": f"Owner session : You can edit any slides."}
    else:
        raise HTTPException(status_code=401, detail="Unauthorized access. Wrong password.")
    
# logout
@router.post("/auth/logout")
def logout(response: Response, session_id: str = Cookie(None)):
    logout_user = db_sessions.pop(session_id)
    response.delete_cookie(key="session_id")

    return {"message": f"Owner signed out. You cannot edit any slides anymore."}

# session check
@router.get("/auth/me")
def session(session_id: str = Cookie(None)):
    role = ""
    if session_id in db_sessions:
        if db_sessions[session_id] == "owner":
            role = "owner"
    else:
        role = "viewer"
    return {"role": role}