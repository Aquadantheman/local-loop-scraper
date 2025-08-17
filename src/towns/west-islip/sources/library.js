// src/towns/west-islip/sources/library.js - Fixed for pure Puppeteer
import { log } from 'apify';
import { generateHash } from '../../../utils/hash-generator.js';
import { isEventInFuture } from '../../../utils/date-parser.js';

export async function scrapeLibrary(page) {
  log.info('=== SCRAPING: West Islip Public Library ===');
  
  try {
    await page.goto('https://westisliplibrary.libnet.info/events?r=days&n=60', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // Wait for content to load (use setTimeout instead of waitForTimeout)
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Try to wait for events to appear
    try {
      await page.waitForSelector('.eelistevent', { timeout: 10000 });
    } catch (e) {
      log.info('No .eelistevent elements found, continuing anyway...');
    }
    
    const events = await page.evaluate(() => {
      const events = [];
      
      const eventElements = document.querySelectorAll('.eelistevent');
      console.log(`Found ${eventElements.length} .eelistevent elements`);
      
      Array.from(eventElements).forEach((element, index) => {
        const text = element.textContent || '';
        
        if (text.length < 30) return;
        
        const lines = text.split('\n').filter(line => line.trim().length > 5);
        let rawTitle = '';
        if (lines.length > 0) {
          rawTitle = lines[0].trim();
        }
        
        let cleanTitle = '';
        
        // Extract title before day names
        const beforeDayMatch = rawTitle.match(/^(.+?)(?=\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))/i);
        if (beforeDayMatch && beforeDayMatch[1] && beforeDayMatch[1].length > 5) {
          cleanTitle = beforeDayMatch[1].trim();
        } else {
          const beforeMonthMatch = rawTitle.match(/^(.+?)(?=\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/i);
          if (beforeMonthMatch && beforeMonthMatch[1] && beforeMonthMatch[1].length > 5) {
            cleanTitle = beforeMonthMatch[1].trim();
          } else {
            cleanTitle = rawTitle.length > 80 ? rawTitle.substring(0, 80).trim() : rawTitle;
          }
        }
        
        cleanTitle = cleanTitle.replace(/[:\-]+$/, '').trim();
        
        // Extract date/time
        let dateTime = '';
        const dateTimePatterns = [
          /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}:\s*\d{1,2}:\d{2}\s*(?:AM|PM)\s*[-—–]\s*\d{1,2}:\d{2}\s*(?:AM|PM)/i,
          /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}:\s*\d{1,2}:\d{2}\s*(?:AM|PM)/i,
          /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}:\s*\d{1,2}:\d{2}\s*(?:AM|PM)/i,
          /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}\b/i
        ];
        
        for (const pattern of dateTimePatterns) {
          const match = text.match(pattern);
          if (match) {
            dateTime = match[0].trim();
            break;
          }
        }
        
        // Extract age group and event type
        let ageGroup = '';
        const ageMatch = text.match(/Age group:\s*([^:]*?)(?=\s*event type:|$)/i);
        if (ageMatch) {
          ageGroup = ageMatch[1].trim().replace(/\s+/g, ' ');
        }
        
        let eventType = '';
        const typeMatch = text.match(/event type:\s*([^A-Z\n]*?)(?=\n[A-Z]|$)/i);
        if (typeMatch) {
          eventType = typeMatch[1].trim().replace(/\s+/g, ' ');
        }
        
        // Create description
        let description = text
          .replace(rawTitle, '')
          .replace(/Age group:.*?(?=event type:|$)/s, '')
          .replace(/event type:.*?(?=\n[A-Z]|$)/s, '')
          .trim();
        
        if (description.length < 20) {
          description = `${cleanTitle} at the West Islip Public Library.`;
          if (ageGroup) description += ` Age group: ${ageGroup}.`;
          if (eventType) description += ` Event type: ${eventType}.`;
        }
        
        if (description.length > 500) {
          description = description.substring(0, 500) + '...';
        }
        
        // Extract URL
        let url = '';
        const linkEl = element.querySelector('a[href]');
        if (linkEl && linkEl.href && !linkEl.href.includes('#calendar')) {
          url = linkEl.href;
        }
        
        if (cleanTitle && cleanTitle.length > 5 && cleanTitle.length < 200) {
          events.push({
            title_raw: cleanTitle,
            description_raw: description,
            start_raw: dateTime,
            location_raw: 'West Islip Public Library',
            url_raw: url,
            category_hint: `library${ageGroup ? ' - ' + ageGroup : ''}${eventType ? ' - ' + eventType : ''}`,
            source: 'West Islip Public Library',
            fetched_at: new Date().toISOString()
          });
        }
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
    
    log.info(`Extracted ${uniqueEvents.length} unique future events from West Islip Public Library`);
    if (filteredOutPastEvents > 0) {
      log.info(`Filtered out ${filteredOutPastEvents} past events from Library`);
    }
    
    if (uniqueEvents.length > 0) {
      log.info(`Sample library event: "${uniqueEvents[0].title_raw}" - Date: "${uniqueEvents[0].start_raw}"`);
    }
    
    return uniqueEvents;
    
  } catch (error) {
    log.error('Error scraping West Islip Public Library:', error.message);
    return [];
  }
}
