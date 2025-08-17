// src/towns/west-islip/sources/historical.js - Fixed Historical Society scraper
import { log } from 'apify';
import { generateHash } from '../../../utils/hash-generator.js';
import { isEventInFuture } from '../../../utils/date-parser.js';

export async function scrapeHistoricalSociety(page) {
  log.info('=== SCRAPING: West Islip Historical Society ===');
  
  try {
    await page.goto('https://www.westisliphistoricalsociety.org/index.php/events/eventsbyyear/2025/-', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // Use setTimeout instead of page.waitForTimeout
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const events = await page.evaluate(() => {
      const events = [];
      
      const eventLinks = document.querySelectorAll('a[href*="eventdetail"]');
      
      eventLinks.forEach((link) => {
        const linkText = link.textContent?.trim() || '';
        const href = link.href || '';
        
        if (!linkText || linkText.length < 5) return;
        
        let contextText = '';
        let currentElement = link.parentElement;
        
        for (let i = 0; i < 5; i++) {
          if (currentElement) {
            const text = currentElement.textContent || '';
            if (text.length > contextText.length) {
              contextText = text;
            }
            currentElement = currentElement.parentElement;
          }
        }
        
        let title = linkText.replace(/::.*$/, '').trim();
        
        let dateTime = '';
        
        const fullDateMatch = contextText.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\s+\d{1,2}:\d{2}(?:am|pm)\s*-\s*\d{1,2}:\d{2}(?:am|pm)/i);
        if (fullDateMatch) {
          dateTime = fullDateMatch[0];
        } else {
          const dateMatch = contextText.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i);
          if (dateMatch) {
            dateTime = dateMatch[0];
            
            const timeMatch = contextText.match(/\d{1,2}:\d{2}(?:am|pm)\s*-\s*\d{1,2}:\d{2}(?:am|pm)/i);
            if (timeMatch) {
              dateTime += ` ${timeMatch[0]}`;
            }
          }
        }
        
        let description = `${title} at the West Islip Historical Society.`;
        
        if (title.toLowerCase().includes('history center open')) {
          description = 'Visit the West Islip History Center! Explore local historical exhibits, artifacts, and learn about the rich heritage of our community. Free and open to the public.';
        } else if (title.toLowerCase().includes('general meeting')) {
          description = 'West Islip Historical Society General Meeting. All community members are welcome to attend and learn about local history preservation efforts and upcoming events.';
        } else if (title.toLowerCase().includes('lizzy')) {
          description = 'Special community event celebrating Lizzy the Lion and West Islip local history. Family-friendly activities and historical presentations.';
        }
        
        let category = 'historical society';
        if (title.toLowerCase().includes('open')) {
          category = 'historical society - open house';
        } else if (title.toLowerCase().includes('meeting')) {
          category = 'historical society - meeting';
        } else if (title.toLowerCase().includes('lizzy')) {
          category = 'historical society - special event';
        }
        
        events.push({
          title_raw: title,
          description_raw: description,
          start_raw: dateTime,
          location_raw: 'West Islip Historical Society',
          url_raw: href,
          category_hint: category,
          source: 'West Islip Historical Society',
          fetched_at: new Date().toISOString()
        });
      });
      
      return events;
    });
    
    const uniqueEvents = [];
    const seenHashes = new Set();
    let filteredOutPastEvents = 0;
    
    events.forEach(event => {
      event.hash = generateHash(event.title_raw, event.start_raw, event.description_raw, event.source);
      
      if (isEventInFuture(event.start_raw)) {
        if (!seenHashes.has(event.hash)) {
          seenHashes.add(event.hash);
          uniqueEvents.push(event);
        }
      } else {
        filteredOutPastEvents++;
      }
    });
    
    log.info(`Extracted ${uniqueEvents.length} unique future events from West Islip Historical Society`);
    if (filteredOutPastEvents > 0) {
      log.info(`Filtered out ${filteredOutPastEvents} past events from Historical Society`);
    }
    
    if (uniqueEvents.length > 0) {
      log.info(`Sample historical event: "${uniqueEvents[0].title_raw}" - Date: "${uniqueEvents[0].start_raw}"`);
    }
    
    return uniqueEvents;
    
  } catch (error) {
    log.error('Error scraping West Islip Historical Society:', error.message);
    return [];
  }
}
