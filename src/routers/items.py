from db import db_items
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


class Item(BaseModel):
    name: str
    price: float

class ItemPrice(BaseModel):
    new_price: float


router = APIRouter()

# CRUD C : Create
@router.post("/items")
def add_items(item: Item):
    db_items[item.name] = item.price
    return {"message": f"item added: {item}"}

# CRUD R : Read
@router.get("/items")
def get_items():
    return db_items

# CRUD R : Read (특정 item)
@router.get("/items/{item_id}")
def get_item(item_id: str):
    if item_id not in db_items:
        raise HTTPException(status_code=404, detail="item not found.")
    return {item_id: db_items[item_id]}

# CRUD U : Update
@router.put("/items/{item_id}")
def update_item(item_id: str, price: ItemPrice):
    if item_id not in db_items:
        raise HTTPException(status_code=404, detail="item not found.")
    db_items[item_id] = price.new_price
    return {"message": f"item updated - name: {item_id}, price: {db_items[item_id]}"}

# CRUD D : Delete
@router.delete("/items/{item_id}")
def delete_item(item_id: str):
    if item_id not in db_items:
        raise HTTPException(status_code=404, detail="item not found.")
    price = db_items.pop(item_id)
    return {"message": f"item deleted - name: {item_id}, price: {price}"}