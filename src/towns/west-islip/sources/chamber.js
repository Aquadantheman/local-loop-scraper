// src/towns/west-islip/sources/chamber.js - West Islip Chamber of Commerce scraper
import { log } from 'apify';
import { generateHash } from '../../../utils/hash-generator.js';
import { isEventInFuture } from '../../../utils/date-parser.js';

export async function scrapeChamber(page) {
  log.info('=== SCRAPING: West Islip Chamber of Commerce ===');
  
  try {
    await page.goto('https://www.westislipchamber.org/events', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    await page.waitForTimeout(8000);
    
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    
    await page.waitForTimeout(3000);
    
    const events = await page.evaluate(() => {
      const events = [];
      
      // First, try to find structured event elements with links
      const eventContainers = [
        '.event-item',
        '.event-card', 
        '[class*="event"]',
        '.tribe-events-list-event-title',
        'h3 a[href]',
        'h2 a[href]',
        'article a[href]'
      ];
      
      let foundStructuredEvents = false;
      
      // Try each selector to find event containers with links
      for (const selector of eventContainers) {
        const elements = document.querySelectorAll(selector);
        
        if (elements.length > 0) {
          console.log(`Found ${elements.length} elements with selector: ${selector}`);
          
          Array.from(elements).forEach(element => {
            let eventTitle = '';
            let eventUrl = '';
            let eventText = element.textContent || '';
            
            // If this element is a link itself
            if (element.tagName === 'A' && element.href) {
              eventTitle = element.textContent.trim();
              eventUrl = element.href;
            } else {
              // Look for links within this element
              const linkEl = element.querySelector('a[href]');
              if (linkEl && linkEl.href) {
                eventTitle = linkEl.textContent.trim() || element.textContent.trim();
                eventUrl = linkEl.href;
              } else {
                eventTitle = element.textContent.trim();
              }
            }
            
            // Extract date from the text
            let dateTime = '';
            const datePatterns = [
              /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s*\d{4},?\s*\d{1,2}:\d{2}\s*(?:AM|PM)\s*[–—-]\s*\d{1,2}:\d{2}\s*(?:AM|PM)/gi,
              /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s*\d{4},?\s*\d{1,2}:\d{2}\s*(?:AM|PM)/gi,
              /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s*\d{4}/gi
            ];
            
            for (const pattern of datePatterns) {
              const match = eventText.match(pattern);
              if (match) {
                dateTime = match[0];
                break;
              }
            }
            
            if (eventTitle && eventTitle.length > 10 && eventTitle.length < 200) {
              events.push({
                title_raw: eventTitle,
                description_raw: eventText.substring(0, 500),
                start_raw: dateTime,
                location_raw: 'West Islip Chamber of Commerce Area',
                url_raw: eventUrl || '',
                category_hint: 'chamber',
                source: 'West Islip Chamber of Commerce',
                fetched_at: new Date().toISOString()
              });
              
              foundStructuredEvents = true;
            }
          });
        }
        
        if (foundStructuredEvents) break;
      }
      
      // If no structured events found, fall back to text-based extraction
      if (!foundStructuredEvents) {
        console.log('No structured events found, falling back to text extraction');
        
        const bodyText = document.body.textContent || '';
        
        // Look for "Upcoming Events" section
        const upcomingEventsMatch = bodyText.match(/Upcoming Events(.{1,3000}?)(?=\n\n|Contact|Footer|$)/s);
        
        if (upcomingEventsMatch) {
          const eventsSection = upcomingEventsMatch[1];
          console.log('Found Upcoming Events section:', eventsSection.substring(0, 400));
          
          const eventPatterns = [
            /([^.]+?)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s*\d{4},?\s*\d{1,2}:\d{2}\s*(?:AM|PM)\s*[–—-]\s*\d{1,2}:\d{2}\s*(?:AM|PM)\s*([^.]*?)(?=\n|$)/gi,
            /([^.]+?)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s*\d{4},?\s*\d{1,2}:\d{2}\s*(?:AM|PM)\s*([^.]*?)(?=\n|$)/gi,
            /([^.]+?)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s*\d{4}([^.]*?)(?=\n|$)/gi
          ];
          
          for (const pattern of eventPatterns) {
            let match;
            while ((match = pattern.exec(eventsSection)) !== null) {
              const [fullMatch, eventName, month] = match;
              
              if (eventName && eventName.trim().length > 5) {
                const title = eventName.trim();
                
                const dateMatch = fullMatch.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s*\d{4},?\s*\d{1,2}:\d{2}\s*(?:AM|PM)(?:\s*[–—-]\s*\d{1,2}:\d{2}\s*(?:AM|PM))?/i);
                const dateTime = dateMatch ? dateMatch[0] : '';
                
                const locationMatch = fullMatch.match(/(?:\d{1,2}:\d{2}\s*(?:AM|PM))\s*[–—-]?\s*(?:\d{1,2}:\d{2}\s*(?:AM|PM))?\s*(.+?)$/i);
                let location = 'West Islip Chamber of Commerce Area';
                if (locationMatch && locationMatch[1]) {
                  location = locationMatch[1].trim();
                  location = location.replace(/Learn more.*$/i, '').trim();
                }
                
                // Try to find URL for this event by looking for links with similar text
                let eventUrl = '';
                const allLinks = document.querySelectorAll('a[href]');
                
                for (const link of allLinks) {
                  const linkText = link.textContent.toLowerCase();
                  const titleWords = title.toLowerCase().split(' ').slice(0, 3); // First 3 words
                  
                  if (titleWords.some(word => word.length > 3 && linkText.includes(word))) {
                    eventUrl = link.href;
                    console.log(`Found matching URL for "${title}": ${eventUrl}`);
                    break;
                  }
                }
                
                events.push({
                  title_raw: title.substring(0, 150),
                  description_raw: fullMatch.substring(0, 500),
                  start_raw: dateTime,
                  location_raw: location,
                  url_raw: eventUrl,
                  category_hint: 'chamber',
                  source: 'West Islip Chamber of Commerce',
                  fetched_at: new Date().toISOString()
                });
              }
            }
          }
        }
      }
      
      console.log(`Total events found: ${events.length}`);
      events.forEach((event, i) => {
        console.log(`Event ${i + 1}: "${event.title_raw}" - URL: "${event.url_raw}" - Date: "${event.start_raw}"`);
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
    
    log.info(`Extracted ${uniqueEvents.length} unique future events from West Islip Chamber of Commerce`);
    if (filteredOutPastEvents > 0) {
      log.info(`Filtered out ${filteredOutPastEvents} past events from Chamber`);
    }
    
    if (uniqueEvents.length > 0) {
      log.info(`Sample chamber event: "${uniqueEvents[0].title_raw}" - Date: "${uniqueEvents[0].start_raw}" - URL: "${uniqueEvents[0].url_raw}"`);
    }
    
    return uniqueEvents;
    
  } catch (error) {
    log.error('Error scraping West Islip Chamber of Commerce:', error.message);
    return [];
  }
}
