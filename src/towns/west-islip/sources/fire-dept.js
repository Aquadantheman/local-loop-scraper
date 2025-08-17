// src/towns/west-islip/sources/fire-dept.js - Fixed for pure Puppeteer
import { log } from 'apify';
import { generateHash } from '../../../utils/hash-generator.js';
import { isEventInFuture } from '../../../utils/date-parser.js';

export async function scrapeFireDepartment(page) {
  log.info('=== SCRAPING: West Islip Fire Department ===');
  
  try {
    // Start with current month, then check next few months
    const now = new Date();
    const baseUrl = 'https://westislipfd.com/events/category/public-event/list/?tribe-bar-date=';
    const allEvents = [];
    
    // Check current month and next 3 months
    for (let monthOffset = 0; monthOffset < 4; monthOffset++) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
      const dateParam = targetDate.toISOString().slice(0, 7) + '-01'; // Format: 2025-08-01
      const url = baseUrl + dateParam;
      
      log.info(`Checking Fire Department events for ${targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`);
      
      try {
        await page.goto(url, { 
          waitUntil: 'domcontentloaded',
          timeout: 30000 
        });
        
        // Use setTimeout instead of page.waitForTimeout
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const monthEvents = await page.evaluate(() => {
          const events = [];
          
          // Look for event containers
          const eventSelectors = [
            '.tribe-events-calendar-list__event-row',
            '.tribe-events-list-event',
            '.tribe-event-list-event',
            '[class*="event"][class*="row"]:not([class*="navigation"]):not([class*="header"])',
            'article.tribe-events-calendar-list__event'
          ];
          
          let eventElements = [];
          for (const selector of eventSelectors) {
            eventElements = document.querySelectorAll(selector);
            if (eventElements.length > 0) {
              console.log(`Found ${eventElements.length} events using selector: ${selector}`);
              break;
            }
          }
          
          // If no structured events, look for text content
          if (eventElements.length === 0) {
            const allElements = document.querySelectorAll('*');
            const potentialEvents = [];
            
            Array.from(allElements).forEach(element => {
              const text = element.textContent || '';
              const className = element.className || '';
              
              if (text.length < 30 || text.length > 800) return;
              
              // Must contain event-like keywords
              const eventKeywords = ['comedy', 'night', 'fundraiser', 'open house', 'training', 'meeting'];
              const hasEventKeyword = eventKeywords.some(keyword => 
                text.toLowerCase().includes(keyword)
              );
              
              // Must contain date/time info
              const hasDateInfo = /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}|\d{1,2}:\d{2})\b/i.test(text);
              
              // Exclude navigation elements
              const excludeKeywords = [
                'navigation', 'calendar', 'subscribe', 'export', 'google', 
                'outlook', 'previous', 'next', 'upcoming', 'views', 'list',
                'month', 'day', 'week', 'function', 'var ', 'completed'
              ];
              
              const isNavigation = excludeKeywords.some(keyword => 
                text.toLowerCase().includes(keyword) || 
                className.toLowerCase().includes(keyword)
              );
              
              if (hasEventKeyword && hasDateInfo && !isNavigation) {
                potentialEvents.push(element);
              }
            });
            
            eventElements = potentialEvents;
          }
          
          Array.from(eventElements).forEach((element) => {
            const text = element.textContent || '';
            
            if (text.length < 30) return;
            
            // Extract title
            let title = '';
            const titleSelectors = ['h1', 'h2', 'h3', 'h4', '.event-title', '[class*="title"]'];
            
            for (const selector of titleSelectors) {
              const titleEl = element.querySelector(selector);
              if (titleEl && titleEl.textContent.trim().length > 5) {
                title = titleEl.textContent.trim();
                break;
              }
            }
            
            if (!title) {
              const lines = text.split('\n').filter(line => line.trim().length > 5);
              if (lines.length > 0) {
                title = lines[0].trim().substring(0, 100);
              }
            }
            
            if (!title || title.length < 5) return;
            
            // Extract date information
            let dateTime = '';
            const datePatterns = [
              /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi,
              /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}/gi,
              /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g
            ];
            
            for (const pattern of datePatterns) {
              const matches = text.match(pattern);
              if (matches && matches.length > 0) {
                dateTime = matches[0];
                
                // Look for time
                const timeMatch = text.match(/\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)\b/i);
                if (timeMatch) {
                  dateTime += ` ${timeMatch[0]}`;
                }
                break;
              }
            }
            
            // Extract location
            let location = 'West Islip Fire Department';
            
            // Create description
            let description = text.substring(0, 250).trim();
            if (title) {
              description = description.replace(title, '').trim();
            }
            
            if (description.length < 20) {
              description = `${title} hosted by the West Islip Fire Department.`;
            }
            
            // Extract URL
            let url = '';
            const linkEl = element.querySelector('a[href]');
            if (linkEl && linkEl.href && !linkEl.href.includes('javascript:')) {
              url = linkEl.href;
            }
            
            // Determine category
            let category = 'fire department';
            const categoryKeywords = {
              'comedy': 'fire department - entertainment',
              'training': 'fire department - training',
              'drill': 'fire department - drill', 
              'meeting': 'fire department - meeting',
              'fundraiser': 'fire department - fundraiser',
              'open house': 'fire department - open house'
            };
            
            const lowerText = text.toLowerCase();
            for (const [keyword, cat] of Object.entries(categoryKeywords)) {
              if (lowerText.includes(keyword)) {
                category = cat;
                break;
              }
            }
            
            if (title && title.length > 5 && title.length < 150 && dateTime) {
              events.push({
                title_raw: title,
                description_raw: description,
                start_raw: dateTime,
                location_raw: location,
                url_raw: url,
                category_hint: category,
                source: 'West Islip Fire Department',
                fetched_at: new Date().toISOString()
              });
            }
          });
          
          return events;
        });
        
        if (monthEvents.length > 0) {
          log.info(`Found ${monthEvents.length} events for ${targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`);
          allEvents.push(...monthEvents);
        } else {
          log.info(`No events found for ${targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`);
        }
        
        // Delay between months
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (monthError) {
        log.warning(`Error scraping Fire Department for ${targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}: ${monthError.message}`);
      }
    }
    
    // Process events
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
      log.info(`Sample fire department event: "${uniqueEvents[0].title_raw}" - Date: "${uniqueEvents[0].start_raw}"`);
    }
    
    return uniqueEvents;
    
  } catch (error) {
    log.error('Error scraping West Islip Fire Department:', error.message);
    return [];
  }
}
