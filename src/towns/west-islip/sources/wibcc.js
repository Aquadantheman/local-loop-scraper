// src/towns/west-islip/sources/wibcc.js - Targeted scraper based on actual WIBCC website
import { log } from 'apify';
import { generateHash } from '../../../utils/hash-generator.js';
import { isEventInFuture } from '../../../utils/date-parser.js';

export async function scrapeWIBCC(page) {
  log.info('=== SCRAPING: West Islip Breast Cancer Coalition (WIBCC) ===');
  
  try {
    // Go directly to their events page which has the calendar
    log.info('🔍 Loading WIBCC events calendar...');
    await page.goto('https://wibcc.org/events', { 
      waitUntil: 'networkidle2',
      timeout: 45000 
    });
    
    // Wait for GoDaddy Website Builder to fully load the calendar
    log.info('⏳ Waiting for calendar to load...');
    await new Promise(resolve => setTimeout(resolve, 12000));
    
    // Scroll to make sure all content is loaded
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const events = await page.evaluate(() => {
      const events = [];
      
      console.log('WIBCC: Starting event extraction...');
      
      // Method 1: Look for the specific calendar structure
      // Based on the screenshot, events seem to be in a structured layout
      const calendarEvents = [];
      
      // Look for date headers and corresponding event info
      const allText = document.body.innerText || '';
      console.log('WIBCC: Page text length:', allText.length);
      console.log('WIBCC: Sample text:', allText.substring(0, 1000));
      
      // Method 2: Parse the visible text for the specific events we can see
      const lines = allText.split('\n').filter(line => line.trim().length > 0);
      
      let currentDate = '';
      let currentEvent = null;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Look for date headers like "AUGUST 12TH", "OCTOBER 4TH"
        const dateMatch = line.match(/^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{1,2})(?:ST|ND|RD|TH)?$/i);
        
        if (dateMatch) {
          currentDate = line;
          console.log('WIBCC: Found date header:', currentDate);
          continue;
        }
        
        // If we have a current date and this line looks like an event title
        if (currentDate && line.length > 10 && line.length < 200) {
          
          // Skip lines that are clearly times or addresses by themselves
          if (line.match(/^\d{1,2}(AM|PM)\s*-\s*\d{1,2}(AM|PM)$/i) || 
              line.match(/^\d+\s+\w+\s+(Ave|St|Drive|Rd|Road|Hwy|Highway)/i)) {
            continue;
          }
          
          // This looks like an event title
          const eventTitle = line;
          let eventTime = '';
          let eventLocation = '';
          
          // Look at the next few lines for time and location
          for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
            const nextLine = lines[j].trim();
            
            // Look for time patterns
            if (nextLine.match(/\d{1,2}(AM|PM)\s*-\s*\d{1,2}(AM|PM)/i)) {
              eventTime = nextLine;
            }
            // Look for location patterns (address-like strings)
            else if (nextLine.match(/\d+\s+\w+|\w+\s+(Ave|St|Drive|Rd|Road|Hwy|Highway|Marina|Hospital|Center|Hall)/i)) {
              eventLocation = nextLine;
            }
            // If we hit another date or event title, stop
            else if (nextLine.match(/^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{1,2}/i) ||
                     (nextLine.length > 20 && !nextLine.match(/^\d/) && !nextLine.includes('NY'))) {
              break;
            }
          }
          
          // Construct the full date string
          let fullDate = currentDate;
          if (eventTime) {
            fullDate += `, 2025 ${eventTime}`;
          } else {
            fullDate += `, 2025`;
          }
          
          // Use location or default
          if (!eventLocation) {
            eventLocation = 'West Islip Breast Cancer Coalition Area';
          }
          
          // Determine category
          let category = 'wibcc - general';
          const lowerTitle = eventTitle.toLowerCase();
          if (lowerTitle.includes('clam')) category = 'wibcc - clam shucking';
          else if (lowerTitle.includes('awareness')) category = 'wibcc - awareness';
          else if (lowerTitle.includes('screening')) category = 'wibcc - health screening';
          else if (lowerTitle.includes('fundraiser') || lowerTitle.includes('boobs matter')) category = 'wibcc - fundraiser';
          else if (lowerTitle.includes('pink flags')) category = 'wibcc - memorial';
          else if (lowerTitle.includes('ducks')) category = 'wibcc - sports awareness';
          
          const eventObj = {
            title_raw: eventTitle,
            description_raw: `${eventTitle} - West Islip Breast Cancer Coalition event. ${eventLocation}`,
            start_raw: fullDate,
            location_raw: eventLocation,
            url_raw: 'https://wibcc.org/events',
            category_hint: category,
            source: 'West Islip Breast Cancer Coalition',
            fetched_at: new Date().toISOString(),
            detection_method: 'calendar_text_parsing'
          };
          
          events.push(eventObj);
          console.log('WIBCC: Added event:', eventTitle, 'on', fullDate);
          
          // Reset for next event
          currentDate = '';
        }
      }
      
      // Method 3: Fallback - look for specific known events in the text
      if (events.length === 0) {
        console.log('WIBCC: No events found via calendar parsing, trying text search...');
        
        const knownEventPatterns = [
          { pattern: /31st.*?annual.*?clam.*?shucking/i, title: '31st Annual Clam Shucking Event', category: 'wibcc - clam shucking' },
          { pattern: /clam.*?shucking.*?event/i, title: 'Annual Clam Shucking Event', category: 'wibcc - clam shucking' },
          { pattern: /breast.*?cancer.*?awareness.*?night/i, title: 'Breast Cancer Awareness Night', category: 'wibcc - awareness' },
          { pattern: /pink.*?flags.*?celebration/i, title: 'Annual Pink Flags Celebration', category: 'wibcc - memorial' },
          { pattern: /all.*?boobs.*?matter/i, title: 'All Boobs Matter Fundraiser', category: 'wibcc - fundraiser' },
          { pattern: /august.*?12/i, title: 'WIBCC August Event', category: 'wibcc - general' }
        ];
        
        knownEventPatterns.forEach(pattern => {
          if (pattern.pattern.test(allText)) {
            console.log('WIBCC: Found known event pattern:', pattern.title);
            
            // Try to extract date from nearby text
            const match = allText.match(pattern.pattern);
            if (match) {
              const matchIndex = allText.indexOf(match[0]);
              const surroundingText = allText.substring(Math.max(0, matchIndex - 200), matchIndex + 200);
              
              const dateMatch = surroundingText.match(/(?:august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}/gi);
              
              events.push({
                title_raw: pattern.title,
                description_raw: `${pattern.title} - West Islip Breast Cancer Coalition community event.`,
                start_raw: dateMatch ? dateMatch[0] : 'August 12, 2025',
                location_raw: 'West Islip Breast Cancer Coalition Area',
                url_raw: 'https://wibcc.org/events',
                category_hint: pattern.category,
                source: 'West Islip Breast Cancer Coalition',
                fetched_at: new Date().toISOString(),
                detection_method: 'pattern_matching'
              });
            }
          }
        });
      }
      
      console.log('WIBCC: Total events found:', events.length);
      return events;
    });
    
    // Filter and deduplicate
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
    
    log.info(`Extracted ${uniqueEvents.length} unique future events from West Islip Breast Cancer Coalition`);
    if (filteredOutPastEvents > 0) {
      log.info(`Filtered out ${filteredOutPastEvents} past events from WIBCC`);
    }
    
    if (uniqueEvents.length > 0) {
      uniqueEvents.forEach((event, i) => {
        log.info(`WIBCC Event ${i + 1}: "${event.title_raw}" - ${event.start_raw} (${event.detection_method})`);
      });
    } else {
      log.warning('No WIBCC events detected despite calendar being visible');
    }
    
    return uniqueEvents;
    
  } catch (error) {
    log.error('Error scraping West Islip Breast Cancer Coalition:', error.message);
    return [];
  }
}
