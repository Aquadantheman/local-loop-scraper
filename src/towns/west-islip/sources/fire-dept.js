// src/towns/west-islip/sources/fire-dept.js - Fixed to avoid duplicate event components
import { log } from 'apify';
import { generateHash } from '../../../utils/hash-generator.js';
import { isEventInFuture } from '../../../utils/date-parser.js';

export async function scrapeFireDepartment(page) {
  log.info('=== SCRAPING: West Islip Fire Department ===');
  
  try {
    const allEvents = [];
    
    // Try the main public events calendar page
    const calendarUrl = 'https://westislipfd.com/events/category/public-event/list/';
    
    log.info(`🔍 Checking Fire Department calendar: ${calendarUrl}`);
    await page.goto(calendarUrl, { 
      waitUntil: 'networkidle2',
      timeout: 45000 
    });
    
    // Wait for the modern calendar to load
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    // Scroll to trigger any lazy loading
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const events = await page.evaluate(() => {
      const events = [];
      
      console.log('Fire Dept: Starting proper event extraction...');
      
      // Method 1: Look for complete event containers (not individual components)
      const eventSelectors = [
        '.event-item',
        '.event-card', 
        '.tribe-events-list-event',
        'article[class*="event"]',
        '[data-event-id]',
        '.ec-event'
      ];
      
      let foundStructuredEvents = false;
      
      for (const selector of eventSelectors) {
        const eventElements = document.querySelectorAll(selector);
        
        if (eventElements.length > 0) {
          console.log(`Fire Dept: Found ${eventElements.length} event containers with selector: ${selector}`);
          
          Array.from(eventElements).forEach((element, index) => {
            const text = element.textContent || '';
            const html = element.innerHTML || '';
            
            // Skip if this is clearly just a date header or time component
            if (text.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i) ||
                text.match(/^\d{1,2}:\d{2}\s*(?:am|pm)\s*-\s*\d{1,2}:\d{2}\s*(?:am|pm)$/i) ||
                text.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\s*@/i) ||
                text.trim().length < 15) {
              console.log(`Fire Dept: Skipping component: "${text.trim()}"`);
              return;
            }
            
            if (text.length > 30 && text.length < 1000) {
              // Extract event title - look for meaningful event names
              let title = '';
              const titleSelectors = ['h1', 'h2', 'h3', 'h4', '.event-title', '[class*="title"]', '.tribe-events-list-event-title'];
              
              for (const titleSel of titleSelectors) {
                const titleEl = element.querySelector(titleSel);
                if (titleEl && titleEl.textContent.trim()) {
                  const potentialTitle = titleEl.textContent.trim();
                  // Make sure this is actually a title, not a date/time
                  if (!potentialTitle.match(/^\d/) && 
                      !potentialTitle.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)/i) &&
                      potentialTitle.length > 5) {
                    title = potentialTitle;
                    break;
                  }
                }
              }
              
              // If no title element found, extract from meaningful text
              if (!title) {
                const lines = text.split('\n').filter(line => {
                  const trimmed = line.trim();
                  return trimmed.length > 5 && 
                         !trimmed.match(/^\d{1,2}:\d{2}/) && 
                         !trimmed.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d/i) &&
                         !trimmed.match(/^\$\d+$/);
                });
                
                if (lines.length > 0) {
                  title = lines[0].trim().substring(0, 100);
                }
              }
              
              // Skip if we still don't have a proper title
              if (!title || title.length < 5) {
                console.log(`Fire Dept: No valid title found for element: "${text.substring(0, 50)}..."`);
                return;
              }
              
              // Extract date/time information from the entire element
              let dateTime = '';
              const datePatterns = [
                // "October 4 @ 6:00 pm - 10:00 pm"  
                /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\s*@\s*\d{1,2}:\d{2}\s*(?:am|pm)\s*-\s*\d{1,2}:\d{2}\s*(?:am|pm)/gi,
                // "October 4 @ 6:00 pm"
                /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\s*@\s*\d{1,2}:\d{2}\s*(?:am|pm)/gi,
                // Standard date formats
                /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}/gi
              ];
              
              for (const pattern of datePatterns) {
                const match = text.match(pattern);
                if (match) {
                  dateTime = match[0];
                  break;
                }
              }
              
              // If no date found, try to construct from context
              if (!dateTime) {
                // Look for separate date and time components
                const monthMatch = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i);
                const timeMatch = text.match(/\d{1,2}:\d{2}\s*(?:am|pm)/i);
                const yearMatch = text.match(/\b20\d{2}\b/) || ['2025']; // default to 2025
                
                if (monthMatch && timeMatch) {
                  dateTime = `${monthMatch[0]}, ${yearMatch[0]} ${timeMatch[0]}`;
                } else if (monthMatch) {
                  dateTime = `${monthMatch[0]}, ${yearMatch[0]}`;
                }
              }
              
              // Extract location
              let location = 'West Islip Fire Department';
              const locationPatterns = [
                /West\s+Islip\s+Fire\s+Department\s+HQ/i,
                /\d+\s+Union\s+Blvd/i,
                /309\s+Union\s+Blvd/i,
                /Fire\s+Department\s+HQ/i
              ];
              
              for (const pattern of locationPatterns) {
                const match = text.match(pattern);
                if (match) {
                  location = 'West Islip Fire Department HQ, 309 Union Blvd, West Islip, NY';
                  break;
                }
              }
              
              // Extract price if mentioned
              let priceInfo = '';
              const priceMatch = text.match(/\$\d+/);
              if (priceMatch) {
                priceInfo = ` Admission: ${priceMatch[0]}.`;
              }
              
              // Extract URL
              let url = '';
              const linkEl = element.querySelector('a[href]');
              if (linkEl && linkEl.href && !linkEl.href.includes('javascript:')) {
                url = linkEl.href;
              }
              
              // Determine category
              let category = 'fire department';
              const lowerText = text.toLowerCase();
              if (lowerText.includes('comedy')) category = 'fire department - entertainment';
              else if (lowerText.includes('training')) category = 'fire department - training';
              else if (lowerText.includes('meeting')) category = 'fire department - meeting';
              else if (lowerText.includes('fundraiser')) category = 'fire department - fundraiser';
              else if (lowerText.includes('drill')) category = 'fire department - drill';
              
              if (title && dateTime) {
                const eventObj = {
                  title_raw: title,
                  description_raw: `${title} at the West Islip Fire Department.${priceInfo} Event details: ${text.replace(/\s+/g, ' ').substring(0, 200)}`.trim(),
                  start_raw: dateTime,
                  location_raw: location,
                  url_raw: url || window.location.href,
                  category_hint: category,
                  source: 'West Islip Fire Department',
                  fetched_at: new Date().toISOString(),
                  detection_method: 'complete_event_parsing'
                };
                
                events.push(eventObj);
                console.log(`Fire Dept: Added complete event "${title}" on ${dateTime}`);
                foundStructuredEvents = true;
              }
            }
          });
        }
        
        if (foundStructuredEvents) break;
      }
      
      // Method 2: Fallback - try to find and combine event components properly
      if (!foundStructuredEvents) {
        console.log('Fire Dept: No structured events found, trying smart text parsing...');
        
        const allText = document.body.innerText || '';
        
        // Look specifically for Comedy Night and combine its components
        if (allText.toLowerCase().includes('comedy night')) {
          const comedySection = allText.match(/comedy\s+night[\s\S]*?(?=\n\n|\r\n\r\n|$)/gi);
          
          if (comedySection) {
            console.log('Fire Dept: Found Comedy Night section, parsing components...');
            
            // Extract date and time from the section
            const dateMatch = comedySection[0].match(/october\s+\d{1,2}/gi);
            const timeMatch = comedySection[0].match(/\d{1,2}:\d{2}\s*(?:am|pm)\s*-\s*\d{1,2}:\d{2}\s*(?:am|pm)/gi);
            const priceMatch = comedySection[0].match(/\$\d+/);
            
            let fullDateTime = 'October 4, 2025';
            if (dateMatch && timeMatch) {
              fullDateTime = `${dateMatch[0]}, 2025 ${timeMatch[0]}`;
            }
            
            events.push({
              title_raw: 'Comedy Night',
              description_raw: `Comedy Night at the West Islip Fire Department. Join us for an evening of laughter and community entertainment.${priceMatch ? ` Admission: ${priceMatch[0]}.` : ''}`,
              start_raw: fullDateTime,
              location_raw: 'West Islip Fire Department HQ, 309 Union Blvd, West Islip, NY',
              url_raw: window.location.href,
              category_hint: 'fire department - entertainment',
              source: 'West Islip Fire Department',
              fetched_at: new Date().toISOString(),
              detection_method: 'smart_component_combination'
            });
            
            console.log(`Fire Dept: Created combined Comedy Night event`);
          }
        }
      }
      
      console.log(`Fire Dept: Total properly parsed events: ${events.length}`);
      return events;
    });
    
    allEvents.push(...events);
    
    // Deduplicate and filter future events
    const uniqueEvents = [];
    const seenHashes = new Set();
    let filteredOutPastEvents = 0;
    
    allEvents.forEach(event => {
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
    
    log.info(`Extracted ${uniqueEvents.length} unique future events from West Islip Fire Department`);
    if (filteredOutPastEvents > 0) {
      log.info(`Filtered out ${filteredOutPastEvents} past events from Fire Department`);
    }
    
    if (uniqueEvents.length > 0) {
      uniqueEvents.forEach((event, i) => {
        log.info(`Fire Dept Event ${i + 1}: "${event.title_raw}" - ${event.start_raw} (${event.detection_method})`);
      });
    } else {
      log.warning('No Fire Department events detected');
    }
    
    return uniqueEvents;
    
  } catch (error) {
    log.error('Error scraping West Islip Fire Department:', error.message);
    return [];
  }
}
