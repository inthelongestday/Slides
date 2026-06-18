from db import db_users, db_sessions
from fastapi import APIRouter, HTTPException, Response, Cookie
from pydantic import BaseModel

import uuid


class Login(BaseModel):
    username: str
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
    user = info.username
    pw = info.password
    if user in db_users:
        if db_users[user] == pw:
            session_id = generate_unique_session_id()
            db_sessions[session_id] = user
            
            response.set_cookie(key="session_id", value=session_id)
            return {"message": f"User {user} signed in."}
        else:
            raise HTTPException(status_code=401, detail="Unauthorized access. Wrong password.")
    else:
        raise HTTPException(status_code=401, detail=f"Unauthorized Access. User {user} not found.")

# logout
@router.post("/auth/logout")
def logout(response: Response, session_id: str = Cookie(None)):
    logout_user = db_sessions.pop(session_id)
    response.delete_cookie(key="session_id")

    return {"message": f"User {logout_user} signed out."}