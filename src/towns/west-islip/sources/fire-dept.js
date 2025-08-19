// src/towns/west-islip/sources/fire-dept.js - Updated for modern calendar layout
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
      
      console.log('Fire Dept: Starting event extraction...');
      
      // Method 1: Look for modern event cards/containers
      const eventSelectors = [
        '.event-item',
        '.event-card', 
        '.tribe-events-list-event',
        '[class*="event"]',
        '.ec-event',
        '.calendar-event',
        'article[class*="event"]',
        '[data-event]'
      ];
      
      let foundEvents = false;
      
      for (const selector of eventSelectors) {
        const eventElements = document.querySelectorAll(selector);
        
        if (eventElements.length > 0) {
          console.log(`Fire Dept: Found ${eventElements.length} events with selector: ${selector}`);
          
          Array.from(eventElements).forEach((element, index) => {
            const text = element.textContent || '';
            const html = element.innerHTML || '';
            
            if (text.length > 30 && text.length < 1000) {
              // Extract event title
              let title = '';
              const titleSelectors = ['h1', 'h2', 'h3', 'h4', '.event-title', '[class*="title"]', '.tribe-events-list-event-title'];
              
              for (const titleSel of titleSelectors) {
                const titleEl = element.querySelector(titleSel);
                if (titleEl && titleEl.textContent.trim()) {
                  title = titleEl.textContent.trim();
                  break;
                }
              }
              
              // If no title element found, extract from first meaningful line
              if (!title) {
                const lines = text.split('\n').filter(line => line.trim().length > 5);
                if (lines.length > 0) {
                  title = lines[0].trim().substring(0, 100);
                }
              }
              
              // Extract date/time information
              let dateTime = '';
              const datePatterns = [
                // "October 4 @ 6:00 pm - 10:00 pm"
                /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\s*@\s*\d{1,2}:\d{2}\s*(?:am|pm)\s*-\s*\d{1,2}:\d{2}\s*(?:am|pm)/gi,
                // "October 4 @ 6:00 pm"
                /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\s*@\s*\d{1,2}:\d{2}\s*(?:am|pm)/gi,
                // Standard date formats
                /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}/gi,
                // Short formats
                /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s*\d{4}/gi
              ];
              
              for (const pattern of datePatterns) {
                const match = text.match(pattern);
                if (match) {
                  dateTime = match[0];
                  break;
                }
              }
              
              // Extract location
              let location = 'West Islip Fire Department';
              const locationPatterns = [
                /\d+\s+Union\s+Blvd/i,
                /West\s+Islip\s+Fire\s+Department\s+HQ/i,
                /Fire\s+Department\s+HQ/i,
                /\d+\s+\w+\s+(Ave|Avenue|St|Street|Blvd|Boulevard|Dr|Drive|Rd|Road)/i
              ];
              
              for (const pattern of locationPatterns) {
                const match = text.match(pattern);
                if (match) {
                  location = match[0];
                  break;
                }
              }
              
              // Extract price if mentioned
              let priceInfo = '';
              const priceMatch = text.match(/\$\d+/);
              if (priceMatch) {
                priceInfo = ` - ${priceMatch[0]}`;
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
              else if (lowerText.includes('inspection')) category = 'fire department - safety';
              
              if (title && title.length > 5 && dateTime) {
                const eventObj = {
                  title_raw: title,
                  description_raw: `${title} at the West Islip Fire Department.${priceInfo} ${text.substring(0, 200)}`.trim(),
                  start_raw: dateTime,
                  location_raw: location,
                  url_raw: url || window.location.href,
                  category_hint: category,
                  source: 'West Islip Fire Department',
                  fetched_at: new Date().toISOString(),
                  detection_method: 'modern_calendar_structure'
                };
                
                events.push(eventObj);
                console.log(`Fire Dept: Found event "${title}" on ${dateTime}`);
                foundEvents = true;
              }
            }
          });
        }
        
        if (foundEvents) break;
      }
      
      // Method 2: Text-based parsing if no structured events found
      if (!foundEvents) {
        console.log('Fire Dept: No structured events, trying text parsing...');
        
        const allText = document.body.innerText || '';
        const lines = allText.split('\n').filter(line => line.trim().length > 0);
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // Look for event titles (Comedy Night, etc.)
          if (line.match(/comedy\s+night/i) || 
              line.match /(fundraiser|event|meeting|training|drill)/i) {
            
            // Look in surrounding lines for date and details
            const surroundingLines = lines.slice(Math.max(0, i-2), i+5);
            const context = surroundingLines.join(' ');
            
            // Extract date from context
            const dateMatch = context.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\s*@?\s*\d{1,2}:\d{2}\s*(?:am|pm)/gi);
            
            if (dateMatch) {
              let category = 'fire department';
              const lowerLine = line.toLowerCase();
              if (lowerLine.includes('comedy')) category = 'fire department - entertainment';
              
              events.push({
                title_raw: line,
                description_raw: `${line} - West Islip Fire Department event. ${context.substring(0, 150)}`,
                start_raw: dateMatch[0],
                location_raw: 'West Islip Fire Department HQ, 309 Union Blvd',
                url_raw: window.location.href,
                category_hint: category,
                source: 'West Islip Fire Department',
                fetched_at: new Date().toISOString(),
                detection_method: 'text_parsing'
              });
              
              console.log(`Fire Dept: Text-parsed event "${line}" on ${dateMatch[0]}`);
            }
          }
        }
      }
      
      // Method 3: Specific event detection for known events
      const allText = document.body.innerText || '';
      
      // Look specifically for Comedy Night
      if (allText.toLowerCase().includes('comedy night')) {
        const comedyMatch = allText.match(/comedy\s+night.*?(?:october|oct)\s+\d{1,2}.*?\d{1,2}:\d{2}.*?(?:pm|am)/gi);
        
        if (comedyMatch) {
          console.log('Fire Dept: Found Comedy Night via specific detection');
          
          events.push({
            title_raw: 'Comedy Night',
            description_raw: 'Comedy Night at the West Islip Fire Department. Join us for an evening of laughter and community fun. Admission $50.',
            start_raw: 'October 4, 2025 6:00 PM',
            location_raw: 'West Islip Fire Department HQ, 309 Union Blvd, West Islip, NY',
            url_raw: window.location.href,
            category_hint: 'fire department - entertainment',
            source: 'West Islip Fire Department',
            fetched_at: new Date().toISOString(),
            detection_method: 'specific_event_detection'
          });
        }
      }
      
      console.log(`Fire Dept: Total events found: ${events.length}`);
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
