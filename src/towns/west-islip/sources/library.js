// src/towns/west-islip/sources/library.js - West Islip Public Library scraper
import { log } from 'apify';
import { generateHash } from '../../../utils/hash-generator.js';
import { isEventInFuture } from '../../../utils/date-parser.js';

export async function scrapeLibrary(page) {
  log.info('=== SCRAPING: West Islip Public Library ===');
  
  try {
    await page.goto('https://westisliplibrary.libnet.info/events?r=days&n=60', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await page.waitForTimeout(5000);
    
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
        
        const beforeDayMatch = rawTitle.match(/^(.+?)(?=\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))/i);
        if (beforeDayMatch && beforeDayMatch[1] && beforeDayMatch[1].length > 5) {
          cleanTitle = beforeDayMatch[1].trim();
        } else {
          const beforeMonthMatch = rawTitle.match(/^(.+?)(?=\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/i);
          if (beforeMonthMatch && beforeMonthMatch[1] && beforeMonthMatch[1].length > 5) {
            cleanTitle = beforeMonthMatch[1].trim();
          } else {
            const beforeColonMatch = rawTitle.match(/^(.+?)(?=\s*:)/);
            if (beforeColonMatch && beforeColonMatch[1] && beforeColonMatch[1].length > 5) {
              cleanTitle = beforeColonMatch[1].trim();
            } else {
              cleanTitle = rawTitle.length > 80 ? rawTitle.substring(0, 80).trim() : rawTitle;
            }
          }
        }
        
        cleanTitle = cleanTitle.replace(/[:\-]+$/, '').trim();
        
        if (!cleanTitle || 
            cleanTitle.length < 5 || 
            cleanTitle.toLowerCase().includes('venue details') ||
            cleanTitle.toLowerCase().includes('age group') ||
            /^\d/.test(cleanTitle)) {
          
          const descLines = text.split('\n').filter(line => line.trim().length > 10);
          for (const line of descLines) {
            if (!line.includes('Age group:') && 
                !line.includes('event type:') && 
                !line.includes(':') &&
                line.length > 10 && line.length < 100) {
              cleanTitle = line.trim();
              break;
            }
          }
        }
        
        let dateTime = '';
        const dateTimePatterns = [
          /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}:\s*\d{1,2}:\d{2}\s*(?:AM|PM)\s*[-–—]\s*\d{1,2}:\d{2}\s*(?:AM|PM)/i,
          /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}:\s*\d{1,2}:\d{2}\s*(?:AM|PM)/i,
          /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}:\s*\d{1,2}:\d{2}\s*(?:AM|PM)\s*[-–—]\s*\d{1,2}:\d{2}\s*(?:AM|PM)/i,
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
        
        // Create cleaner description - PRESERVE MORE CONTENT
        let description = text
          .replace(rawTitle, '') // Remove the raw title
          .trim();
        
        // Remove age group and event type lines, but keep the actual description
        description = description
          .replace(/Age group:.*?(?=event type:|$)/s, '')
          .replace(/event type:.*?(?=\n[A-Z]|$)/s, '')
          .trim();
        
        // If description is too short after cleaning, use more of the original text
        if (description.length < 50) {
          // Get lines that look like actual descriptions (not metadata)
          const lines = text.split('\n').filter(line => {
            const l = line.trim();
            return l.length > 20 && 
                   !l.includes('Age group:') && 
                   !l.includes('event type:') && 
                   !l.includes('West Islip Public Library') &&
                   !l.match(/^\w+day,/) && // Skip day names
                   !l.match(/^\d/) && // Skip times/dates
                   !l.includes(':') && // Skip time-like content
                   l.length < 200; // Not too long
          });
          
          if (lines.length > 0) {
            description = lines.slice(0, 2).join(' ').trim(); // Take first 2 good lines
          }
        }
        
        // Final cleanup and length limit
        if (description.length > 500) {
          description = description.substring(0, 500) + '...';
        }
        
        // If still no good description, create a basic one
        if (description.length < 20) {
          description = `${cleanTitle} at the West Islip Public Library.`;
          if (ageGroup) description += ` Age group: ${ageGroup}.`;
          if (eventType) description += ` Event type: ${eventType}.`;
        }
        
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
            fetched_at: new Date().toISOString(),
            debug_info: {
              raw_title: rawTitle,
              age_group: ageGroup,
              event_type: eventType,
              element_index: index
            }
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
