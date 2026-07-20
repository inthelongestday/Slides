import boto3
import json


class S3Client():
  def __init__(self, s3_bucket: str):
    self.s3Client = boto3.client('s3')
    self.s3Bucket = s3_bucket

  def get_object(self, id: str) -> dict | None:
    try:
      object = self.s3Client.get_object(self.s3Bucket, f'index/{id}.json')
    except self.s3Bucket.exceptions.NoSuchKey:
      return None
    return json.loads(object["Body"].read())
  
  def put_object(self, result: dict, id: str):
    self.s3Client.put_object(
      Body = json.dumps(result, default=str),
      Bucket = self.s3Bucket,
      Key = f'index/{id}.json'
    )



# db_items { item_id: price }
# 임시 mock data
db_items = {
    "apple": 1.2,
    "banana": 1.5,
    "kiwi": 1.7
}

# db_log [ class Log() ]
db_log = []

# db_users { username: password }
# primary_key : username
db_users = {
    "kayla": "kayla0621",
    "jiyun": "kai_1203"
}

# db_sessions { session_id: username }
# primary_key : session_id
db_sessions = {}

# owner password
owner_pw = "ownercanedit"