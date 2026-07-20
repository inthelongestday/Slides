import json
from db import db_items, S3Client
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

S3BUCKET = "temporary"

s3_client = S3Client()
router = APIRouter()

class Payload(BaseModel):
    baseRev: int
    payload: json


@router.get("/api/index/{id}")
def read_page(id: str):
    page = s3_client.get_object(S3BUCKET, id)
    if page == None:
        payload = {
            "id": id,
            "kind": "hub",
            "rev": 0,
            "payload": {},
            "updated_by": "owner"
        }
        new_page = json.dumps(payload, default=str)
        return new_page
    return page

@router.put("/api/index/{id}")
def save_page(id: str, payload: Payload):
    if 



# CRUD C : Create
@router.post("/api/items")
def add_items(item: Item):
    db_items[item.name] = item.price
    return {"message": f"item added: {item}"}

# CRUD R : Read
@router.get("/api/items")
def get_items():
    return db_items

# CRUD R : Read (특정 item)
@router.get("/api/items/{item_id}")
def get_item(item_id: str):
    if item_id not in db_items:
        raise HTTPException(status_code=404, detail="item not found.")
    return {item_id: db_items[item_id]}

# CRUD U : Update
@router.put("/api/items/{item_id}")
def update_item(item_id: str, price: ItemPrice):
    if item_id not in db_items:
        raise HTTPException(status_code=404, detail="item not found.")
    db_items[item_id] = price.new_price
    return {"message": f"item updated - name: {item_id}, price: {db_items[item_id]}"}

# CRUD D : Delete
@router.delete("/api/items/{item_id}")
def delete_item(item_id: str):
    if item_id not in db_items:
        raise HTTPException(status_code=404, detail="item not found.")
    price = db_items.pop(item_id)
    return {"message": f"item deleted - name: {item_id}, price: {price}"}