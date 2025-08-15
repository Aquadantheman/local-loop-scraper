// src/towns/west-islip/sources/country-fair.js - West Islip Country Fair scraper
import { log } from 'apify';
import { generateHash } from '../../../utils/hash-generator.js';
import { isEventInFuture } from '../../../utils/date-parser.js';

export async function scrapeCountryFair(page) {
  log.info('=== SCRAPING: West Islip Country Fair ===');
  
  try {
    await page.goto('https://westislipcountryfair.org/', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    await page.waitForTimeout(5000);
    
    const events = await page.evaluate(() => {
      const events = [];
      
      const bodyText = document.body.textContent || '';
      
      const dateMatches = bodyText.match(/(?:Sept|September)\s+\d{1,2}(?:st|nd|rd|th)?\s*,?\s*\d{4}/gi);
      const timeMatches = bodyText.match(/\d{1,2}AM-\d{1,2}PM/gi);
      
      let title = 'West Islip Country Fair';
      let description = '';
      let dateTime = '';
      let location = 'West Islip Public Library, West Islip, NY';
      
      const contentSections = [
        'Live music on the stage',
        'Childrens area with Bounce, Slide, Magician, Face Painting',
        'Italian, Polish, Greek, Crepes, Philly Cheese Steaks, Hot Dogs, Hamburgers, Roasted Corn, Funnel Cakes, Ices, Smoothies, Fried Oreo\'s'
      ];
      
      description = `Annual West Islip Country Fair featuring ${contentSections.join(', ')} and more! Family-friendly community event with food, entertainment, and activities for all ages.`;
      
      if (dateMatches && dateMatches.length > 0) {
        dateTime = dateMatches[0];
        if (timeMatches && timeMatches.length > 0) {
          dateTime += `, ${timeMatches[0]}`;
        }
      }
      
      const rainDateMatch = bodyText.match(/Rain date[:\s]*(?:Sept|September)\s+\d{1,2}(?:st|nd|rd|th)?\s*,?\s*\d{4}/i);
      if (rainDateMatch) {
        description += ` ${rainDateMatch[0]}.`;
      }
      
      if (dateTime) {
        events.push({
          title_raw: title,
          description_raw: description,
          start_raw: dateTime,
          location_raw: location,
          url_raw: 'https://westislipcountryfair.org/',
          category_hint: 'community fair',
          source: 'West Islip Country Fair',
          fetched_at: new Date().toISOString()
        });
      }
      
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
    
    log.info(`Extracted ${uniqueEvents.length} unique future events from West Islip Country Fair`);
    if (filteredOutPastEvents > 0) {
      log.info(`Filtered out ${filteredOutPastEvents} past events from Country Fair`);
    }
  
    if (uniqueEvents.length > 0) {
      log.info(`Sample fair event: "${uniqueEvents[0].title_raw}" - Date: "${uniqueEvents[0].start_raw}"`);
    }
    
    return uniqueEvents;
    
  } catch (error) {
    log.error('Error scraping West Islip Country Fair:', error.message);
    return [];
  }
}
