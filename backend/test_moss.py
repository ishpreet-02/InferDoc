import os
import asyncio
from dotenv import load_dotenv
from inferedge_moss import MossClient

load_dotenv()

PROJECT_ID = os.environ.get("MOSS_PROJECT_ID")
PROJECT_KEY = os.environ.get("MOSS_PROJECT_KEY")

async def main():
    if not PROJECT_ID or not PROJECT_KEY:
        print("Missing credentials!")
        return
    
    client = MossClient(PROJECT_ID, PROJECT_KEY)
    bad_index = "non-existent-index-12345"
    try:
        print(f"Attempting to load bad index '{bad_index}'...")
        await client.load_index(bad_index)
        print("Index loaded successfully!")
    except Exception as e:
        print(f"Error loading index: {type(e).__name__}: {e}")
        
    try:
        print(f"Attempting to query bad index '{bad_index}'...")
        res = await client.query(bad_index, "test query")
        print(f"Query succeeded! Found {len(res.docs)} docs.")
    except Exception as e:
        print(f"Error querying: {type(e).__name__}: {e}")

if __name__ == "__main__":
    asyncio.run(main())
