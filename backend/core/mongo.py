from motor.motor_asyncio import AsyncIOMotorClient
from django.conf import settings

# Global motor client and db
client = None
db = None

def init_mongo():
    global client, db
    if client is None:
        client = AsyncIOMotorClient(settings.MONGO_URL)
        db = client[settings.MONGO_DB_NAME]

def get_db():
    if db is None:
        init_mongo()
    return db
