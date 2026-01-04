import modal
from fastapi import FastAPI
import sys
import os

# Define the image with dependencies and local code
image = (
    modal.Image.debian_slim()
    .pip_install(
        "fastapi",
        "uvicorn",
        "sqlmodel",
        "aiohttp",
        "beautifulsoup4",
        "python-multipart"
    )
    # Add local backend directory to the image
    .add_local_dir("/Users/themuseicon/rosetta.fun/backend", remote_path="/root/backend")
)

# Define the persistent volume for the database
volume = modal.Volume.from_name("rosetta-search-db", create_if_missing=True)

# Create the Modal App
app = modal.App("rosetta-midi-search", image=image)

@app.function(
    volumes={"/data": volume},
    env={"DATABASE_URL": "sqlite:////data/database.db"}
)
@modal.asgi_app()
def web_app():
    import sys
    sys.path.append("/root/backend")
    
    # Import components inside the function
    from main import app as f_app
    from database import create_db_and_tables
    
    # Initialize tables if they don't exist
    create_db_and_tables()
    
    return f_app

# Scheduled function for the scraper
@app.function(
    schedule=modal.Period(days=1),
    volumes={"/data": volume},
    env={"DATABASE_URL": "sqlite:////data/database.db"}
)
async def run_scraper():
    import sys
    sys.path.append("/root/backend")
    
    from scraper import ScrapingPipeline
    pipeline = ScrapingPipeline()
    await pipeline.run()
    print("Scraper run complete.")
