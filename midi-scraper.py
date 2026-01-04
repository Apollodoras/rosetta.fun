"""
MIDI/MusicXML Web Scraping & Ingestion Pipeline
Crawls multiple sources, analyzes files, stores in database
"""

import asyncio
import aiohttp
import logging
from typing import List, Dict, Optional, Set
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
import json
import hashlib
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class ScrapedFile:
    """Raw data from web scraping before analysis"""
    url: str
    title: str
    composer: str
    source: str
    download_url: str
    file_type: str  # 'midi' or 'musicxml'
    metadata: Dict
    scraped_at: str = None
    
    def __post_init__(self):
        if self.scraped_at is None:
            self.scraped_at = datetime.now().isoformat()
    
    @property
    def file_hash(self) -> str:
        """Unique identifier to prevent duplicates"""
        return hashlib.md5(f"{self.url}{self.title}{self.composer}".encode()).hexdigest()

class BaseScraper:
    """Base class for all source scrapers"""
    
    def __init__(self, source_name: str, base_url: str, rate_limit: float = 1.0):
        self.source_name = source_name
        self.base_url = base_url
        self.rate_limit = rate_limit  # seconds between requests
        self.session: Optional[aiohttp.ClientSession] = None
        self.last_request_time = 0
    
    async def _rate_limit_wait(self):
        """Ensure we don't exceed rate limits"""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.rate_limit:
            await asyncio.sleep(self.rate_limit - elapsed)
        self.last_request_time = time.time()
    
    async def fetch_page(self, url: str) -> Optional[str]:
        """Fetch HTML content with rate limiting"""
        await self._rate_limit_wait()
        
        try:
            async with self.session.get(url, timeout=30) as response:
                if response.status == 200:
                    return await response.text()
                else:
                    logger.warning(f"Failed to fetch {url}: Status {response.status}")
                    return None
        except Exception as e:
            logger.error(f"Error fetching {url}: {e}")
            return None
    
    async def scrape(self) -> List[ScrapedFile]:
        """Override in subclasses"""
        raise NotImplementedError

class MuseScoreScraper(BaseScraper):
    """Scraper for MuseScore public domain files"""
    
    def __init__(self):
        super().__init__("MuseScore", "https://musescore.com", rate_limit=2.0)
    
    async def scrape(self) -> List[ScrapedFile]:
        """
        Scrapes MuseScore's public domain section
        Note: In production, use their API if available
        """
        files = []
        
        # Example: Scraping search results pages
        search_queries = [
            "beethoven piano",
            "mozart piano",
            "chopin piano",
            "bach piano"
        ]
        
        for query in search_queries:
            search_url = f"{self.base_url}/sheetmusic?text={query.replace(' ', '+')}"
            html = await self.fetch_page(search_url)
            
            if not html:
                continue
            
            soup = BeautifulSoup(html, 'html.parser')
            
            # Parse search results (HTML structure will vary)
            # This is a simplified example
            for item in soup.select('.search-result-item'):
                try:
                    title_elem = item.select_one('.title')
                    composer_elem = item.select_one('.composer')
                    link_elem = item.select_one('a.download-midi')
                    
                    if not (title_elem and composer_elem and link_elem):
                        continue
                    
                    file_data = ScrapedFile(
                        url=urljoin(self.base_url, item.get('href', '')),
                        title=title_elem.text.strip(),
                        composer=composer_elem.text.strip(),
                        source=self.source_name,
                        download_url=urljoin(self.base_url, link_elem.get('href', '')),
                        file_type='midi',
                        metadata={
                            'genre': self._extract_genre(item),
                            'downloads': self._extract_download_count(item),
                            'rating': self._extract_rating(item)
                        }
                    )
                    files.append(file_data)
                    logger.info(f"Found: {file_data.title} by {file_data.composer}")
                    
                except Exception as e:
                    logger.error(f"Error parsing item: {e}")
                    continue
        
        return files
    
    def _extract_genre(self, item) -> str:
        """Extract genre from HTML element"""
        genre_elem = item.select_one('.genre')
        return genre_elem.text.strip() if genre_elem else "classical"
    
    def _extract_download_count(self, item) -> int:
        """Extract download count"""
        dl_elem = item.select_one('.download-count')
        if dl_elem:
            try:
                return int(dl_elem.text.strip().replace(',', ''))
            except:
                pass
        return 0
    
    def _extract_rating(self, item) -> float:
        """Extract user rating"""
        rating_elem = item.select_one('.rating')
        if rating_elem:
            try:
                return float(rating_elem.get('data-rating', '0'))
            except:
                pass
        return 0.0

class IMSLPScraper(BaseScraper):
    """Scraper for IMSLP (International Music Score Library Project)"""
    
    def __init__(self):
        super().__init__("IMSLP", "https://imslp.org", rate_limit=3.0)
    
    async def scrape(self) -> List[ScrapedFile]:
        """
        Scrapes IMSLP for public domain MIDI files
        """
        files = []
        
        # IMSLP has structured composer pages
        composers = [
            "Beethoven,_Ludwig_van",
            "Mozart,_Wolfgang_Amadeus",
            "Bach,_Johann_Sebastian",
            "Chopin,_Frédéric"
        ]
        
        for composer in composers:
            composer_url = f"{self.base_url}/wiki/{composer}"
            html = await self.fetch_page(composer_url)
            
            if not html:
                continue
            
            soup = BeautifulSoup(html, 'html.parser')
            
            # Find work links
            for work_link in soup.select('a[href*="/wiki/"]'):
                work_title = work_link.text.strip()
                
                # Skip navigation links
                if not work_title or len(work_title) < 5:
                    continue
                
                work_url = urljoin(self.base_url, work_link.get('href'))
                
                # Fetch work page to find MIDI files
                work_html = await self.fetch_page(work_url)
                if not work_html:
                    continue
                
                work_soup = BeautifulSoup(work_html, 'html.parser')
                
                # Find MIDI download links
                for midi_link in work_soup.select('a[href*=".mid"]'):
                    try:
                        file_data = ScrapedFile(
                            url=work_url,
                            title=work_title,
                            composer=composer.replace('_', ' ').split(',')[0],
                            source=self.source_name,
                            download_url=urljoin(self.base_url, midi_link.get('href')),
                            file_type='midi',
                            metadata={
                                'public_domain': True,
                                'catalog_number': self._extract_catalog_number(work_soup)
                            }
                        )
                        files.append(file_data)
                        logger.info(f"Found: {file_data.title} by {file_data.composer}")
                        
                    except Exception as e:
                        logger.error(f"Error parsing MIDI link: {e}")
                        continue
        
        return files
    
    def _extract_catalog_number(self, soup) -> str:
        """Extract opus/catalog number (e.g., Op. 27 No. 2)"""
        catalog_elem = soup.select_one('.catnumber')
        return catalog_elem.text.strip() if catalog_elem else ""

class BitMIDIScraper(BaseScraper):
    """Scraper for BitMIDI"""
    
    def __init__(self):
        super().__init__("BitMIDI", "https://bitmidi.com", rate_limit=1.5)
    
    async def scrape(self) -> List[ScrapedFile]:
        """Scrapes BitMIDI's collection"""
        files = []
        
        # BitMIDI has genre pages
        genres = ["classical", "jazz", "pop", "game"]
        
        for genre in genres:
            genre_url = f"{self.base_url}/genre/{genre}"
            html = await self.fetch_page(genre_url)
            
            if not html:
                continue
            
            soup = BeautifulSoup(html, 'html.parser')
            
            for item in soup.select('.midi-item'):
                try:
                    title = item.select_one('.title').text.strip()
                    download_link = item.select_one('a.download')
                    
                    if not download_link:
                        continue
                    
                    # Extract composer from title if possible
                    composer = self._extract_composer_from_title(title)
                    
                    file_data = ScrapedFile(
                        url=urljoin(self.base_url, item.get('href', '')),
                        title=title,
                        composer=composer,
                        source=self.source_name,
                        download_url=urljoin(self.base_url, download_link.get('href')),
                        file_type='midi',
                        metadata={
                            'genre': genre,
                            'file_size': self._extract_file_size(item)
                        }
                    )
                    files.append(file_data)
                    logger.info(f"Found: {file_data.title}")
                    
                except Exception as e:
                    logger.error(f"Error parsing BitMIDI item: {e}")
                    continue
        
        return files
    
    def _extract_composer_from_title(self, title: str) -> str:
        """Try to extract composer from title patterns"""
        # Look for patterns like "Composer - Title" or "Title by Composer"
        if ' - ' in title:
            return title.split(' - ')[0].strip()
        elif ' by ' in title.lower():
            return title.lower().split(' by ')[-1].strip().title()
        return "Unknown"
    
    def _extract_file_size(self, item) -> int:
        """Extract file size in bytes"""
        size_elem = item.select_one('.file-size')
        if size_elem:
            try:
                size_text = size_elem.text.strip()
                # Parse "15 KB" format
                if 'KB' in size_text:
                    return int(float(size_text.replace('KB', '').strip()) * 1024)
                elif 'MB' in size_text:
                    return int(float(size_text.replace('MB', '').strip()) * 1024 * 1024)
            except:
                pass
        return 0

class ScrapingPipeline:
    """Orchestrates multiple scrapers and manages the ingestion process"""
    
    def __init__(self, output_dir: str = "./scraped_files"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
        self.scrapers: List[BaseScraper] = [
            MuseScoreScraper(),
            IMSLPScraper(),
            BitMIDIScraper()
        ]
        
        self.seen_hashes: Set[str] = set()
    
    async def run(self) -> List[ScrapedFile]:
        """Run all scrapers and collect results"""
        all_files = []
        
        async with aiohttp.ClientSession() as session:
            # Share session across all scrapers
            for scraper in self.scrapers:
                scraper.session = session
            
            # Run scrapers concurrently
            tasks = [scraper.scrape() for scraper in self.scrapers]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for scraper, result in zip(self.scrapers, results):
                if isinstance(result, Exception):
                    logger.error(f"Scraper {scraper.source_name} failed: {result}")
                    continue
                
                logger.info(f"Scraped {len(result)} files from {scraper.source_name}")
                all_files.extend(result)
        
        # Deduplicate
        unique_files = self._deduplicate(all_files)
        logger.info(f"Total unique files: {len(unique_files)}")
        
        # Save to disk
        self._save_results(unique_files)
        
        return unique_files
    
    def _deduplicate(self, files: List[ScrapedFile]) -> List[ScrapedFile]:
        """Remove duplicate files based on hash"""
        unique = []
        
        for file in files:
            if file.file_hash not in self.seen_hashes:
                self.seen_hashes.add(file.file_hash)
                unique.append(file)
        
        return unique
    
    def _save_results(self, files: List[ScrapedFile]):
        """Save scraped data to JSON for review"""
        output_file = self.output_dir / f"scraped_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(
                [asdict(file) for file in files],
                f,
                indent=2,
                ensure_ascii=False
            )
        
        logger.info(f"Saved results to {output_file}")
    
    async def download_files(self, files: List[ScrapedFile], limit: int = 100):
        """Download actual MIDI/MusicXML files"""
        download_dir = self.output_dir / "midi_files"
        download_dir.mkdir(exist_ok=True)
        
        async with aiohttp.ClientSession() as session:
            tasks = []
            for file in files[:limit]:
                tasks.append(self._download_file(session, file, download_dir))
            
            await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _download_file(self, session: aiohttp.ClientSession, 
                            file: ScrapedFile, download_dir: Path):
        """Download a single file"""
        try:
            filename = f"{file.file_hash}.{file.file_type}"
            filepath = download_dir / filename
            
            # Skip if already downloaded
            if filepath.exists():
                return
            
            async with session.get(file.download_url, timeout=30) as response:
                if response.status == 200:
                    content = await response.read()
                    
                    with open(filepath, 'wb') as f:
                        f.write(content)
                    
                    logger.info(f"Downloaded: {file.title}")
                else:
                    logger.warning(f"Failed to download {file.title}: Status {response.status}")
        
        except Exception as e:
            logger.error(f"Error downloading {file.title}: {e}")

# Scheduled scraping job
class ScheduledScraper:
    """Run scraping on a schedule"""
    
    def __init__(self, interval_hours: int = 24):
        self.interval = interval_hours * 3600
        self.pipeline = ScrapingPipeline()
    
    async def run_forever(self):
        """Run scraping job continuously"""
        while True:
            logger.info("Starting scheduled scrape...")
            
            try:
                files = await self.pipeline.run()
                
                # Optionally download files
                await self.pipeline.download_files(files, limit=50)
                
                logger.info(f"Scrape complete. Waiting {self.interval/3600} hours...")
                
            except Exception as e:
                logger.error(f"Scraping job failed: {e}")
            
            await asyncio.sleep(self.interval)

# Command-line interface
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="MIDI Web Scraping Pipeline")
    parser.add_argument("--mode", choices=["once", "scheduled"], default="once")
    parser.add_argument("--download", action="store_true", help="Download files after scraping")
    parser.add_argument("--interval", type=int, default=24, help="Hours between scrapes (scheduled mode)")
    
    args = parser.parse_args()
    
    if args.mode == "once":
        pipeline = ScrapingPipeline()
        files = asyncio.run(pipeline.run())
        
        if args.download:
            asyncio.run(pipeline.download_files(files))
    
    else:  # scheduled
        scheduler = ScheduledScraper(interval_hours=args.interval)
        asyncio.run(scheduler.run_forever())
