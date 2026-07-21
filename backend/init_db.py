# manual db cleanup and creation

import asyncio
import sys
sys.path.insert(0, ".")
from app.db.base import Base
from app.db.session import engine
import app.models

async def init_db():
    print("Dropping existing tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    print("Creating tables in database...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables recreated successfully!")

if __name__ == "__main__":
    asyncio.run(init_db())
