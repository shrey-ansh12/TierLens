import asyncio
from app.core.database import async_engine
from sqlalchemy import text

async def main():
    async with async_engine.connect() as conn:
        res = await conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'"))
        tables = [r[0] for r in res.fetchall()]
        print("Neon Tables:", tables)
        for t in tables:
            c_res = await conn.execute(text(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name='{t}'"))
            cols = [f"{r[0]} ({r[1]})" for r in c_res.fetchall()]
            print(f"  {t}: {', '.join(cols)}")

if __name__ == "__main__":
    asyncio.run(main())
