// src/towns/west-islip/sources/historical.js - Debug version
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
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const events = await page.evaluate(() => {
      const events = [];
      
      const eventLinks = document.querySelectorAll('a[href*="eventdetail"]');
      console.log(`Found ${eventLinks.length} event links`);
      
      eventLinks.forEach((link, index) => {
        const linkText = link.textContent?.trim() || '';
        const href = link.href || '';
        
        if (!linkText || linkText.length < 5) return;
        
        let contextText = '';
        let currentElement = link.parentElement;
        
        // Get more context from parent elements
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
        
        // Try multiple date patterns to find the date
        const datePatterns = [
          // Full format: "Tuesday, February 04, 2025 12:00pm - 02:00pm"
          /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})(?:am|pm)\s*-\s*(\d{1,2}):(\d{2})(?:am|pm)/i,
          // Date with single time: "Tuesday, February 04, 2025 12:00pm"
          /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})(?:am|pm)/i,
          // Just date: "Tuesday, February 04, 2025"
          /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i
        ];
        
        for (const pattern of datePatterns) {
          const match = contextText.match(pattern);
          if (match) {
            dateTime = match[0];
            console.log(`Event ${index + 1}: Found date "${dateTime}" for "${title}"`);
            break;
          }
        }
        
        // If no date found in context, log for debugging
        if (!dateTime) {
          console.log(`Event ${index + 1}: No date found for "${title}"`);
          console.log(`Context: ${contextText.substring(0, 200)}...`);
        }
        
        // Create description based on event type
        let description = `${title} at the West Islip Historical Society.`;
        
        if (title.toLowerCase().includes('history center open')) {
          description = 'Visit the West Islip History Center! Explore local historical exhibits, artifacts, and learn about the rich heritage of our community. Free and open to the public.';
        } else if (title.toLowerCase().includes('general meeting')) {
          description = 'West Islip Historical Society General Meeting. All community members are welcome to attend and learn about local history preservation efforts and upcoming events.';
        } else if (title.toLowerCase().includes('lizzy')) {
          description = 'Special community event celebrating Lizzy the Lion and West Islip local history. Family-friendly activities and historical presentations.';
        }
        
        // Categorize the event
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
          fetched_at: new Date().toISOString(),
          debug_info: {
            linkText: linkText,
            contextLength: contextText.length,
            hasDateTime: !!dateTime
          }
        });
      });
      
      return events;
    });
    
    // Process events with detailed logging
    const uniqueEvents = [];
    const seenHashes = new Set();
    let filteredOutPastEvents = 0;
    
    log.info(`Processing ${events.length} historical society events...`);
    
    events.forEach((event, index) => {
      event.hash = generateHash(event.title_raw, event.start_raw, event.description_raw, event.source);
      
      log.info(`Event ${index + 1}: "${event.title_raw}" - Date: "${event.start_raw}"`);
      
      if (isEventInFuture(event.start_raw)) {
        if (!seenHashes.has(event.hash)) {
          seenHashes.add(event.hash);
          uniqueEvents.push(event);
          log.info(`  ✅ Added to future events`);
        } else {
          log.info(`  🔄 Duplicate event (same hash)`);
        }
      } else {
        filteredOutPastEvents++;
        log.info(`  📅 Filtered out (past event)`);
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
