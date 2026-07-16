from db import db_items
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


class Item(BaseModel):
    name: str
    price: float

class ItemPrice(BaseModel):
    new_price: float


router = APIRouter()
