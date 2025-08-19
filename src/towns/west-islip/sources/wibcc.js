// src/towns/west-islip/sources/wibcc.js - Dynamic WIBCC scraper that auto-detects events
import { log } from 'apify';
import { generateHash } from '../../../utils/hash-generator.js';
import { isEventInFuture } from '../../../utils/date-parser.js';

export async function scrapeWIBCC(page) {
  log.info('=== SCRAPING: West Islip Breast Cancer Coalition (WIBCC) ===');
  
  try {
    const allEvents = [];
    const sources = [
      'https://wibcc.org/',
      'https://wibcc.org/events',
      'https://www.facebook.com/wibcc/',  // Their Facebook page often has event announcements
    ];
    
    for (const url of sources) {
      try {
        log.info(`🔍 Checking ${url} for events...`);
        await page.goto(url, { 
          waitUntil: 'domcontentloaded',
          timeout: 30000 
        });
        
        await new Promise(resolve => setTimeout(resolve, 4000));
        
        const pageEvents = await page.evaluate(() => {
          const events = [];
          
          // Get all text content and analyze it for events
          const allText = document.body.textContent || '';
          const allHTML = document.body.innerHTML || '';
          
          // Look for event-related keywords and patterns
          const eventKeywords = [
            'fundraiser', 'event', 'contest', 'celebration', 'awareness', 'screening',
            'clam shucking', 'bowling', 'ravioli', 'walk', 'run', 'auction', 'gala',
            'benefit', 'charity', 'coalition', 'support', 'pink', 'breast cancer',
            'mammogram', 'health', 'wellness', 'survivor', 'memorial', 'honor'
          ];
          
          // Date patterns to look for
          const datePatterns = [
            // Full dates: "October 21, 2025", "Aug 12th, 2025"
            /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}\b/gi,
            // Short dates: "Oct 21, 2025", "Aug 12th"
            /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s*(?:\d{4})?\b/gi,
            // Numeric dates: "10/21/2025", "8/12/25"
            /\b\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})\b/g,
            // Day + date: "Tuesday, August 12th"
            /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?\b/gi
          ];
          
          // Look for structured event containers first
          const eventContainers = [
            '[class*="event"]', '[id*="event"]', '[class*="Event"]',
            '.announcement', '.news', '.upcoming', '.calendar',
            '.post', '.update', '.notice', 'article', '.content-block'
          ];
          
          let foundStructuredEvents = false;
          
          for (const selector of eventContainers) {
            const elements = document.querySelectorAll(selector);
            
            if (elements.length > 0) {
              Array.from(elements).forEach(element => {
                const elementText = element.textContent || '';
                const elementHTML = element.innerHTML || '';
                
                // Check if this element contains event-related content
                const hasEventKeyword = eventKeywords.some(keyword => 
                  elementText.toLowerCase().includes(keyword.toLowerCase())
                );
                
                if (hasEventKeyword && elementText.length > 50 && elementText.length < 1000) {
                  // Look for dates in this element
                  let foundDate = '';
                  for (const pattern of datePatterns) {
                    const matches = elementText.match(pattern);
                    if (matches && matches.length > 0) {
                      foundDate = matches[0];
                      break;
                    }
                  }
                  
                  if (foundDate) {
                    // Extract title (first meaningful line)
                    const lines = elementText.split('\n').filter(line => line.trim().length > 10);
                    let title = lines.length > 0 ? lines[0].trim() : '';
                    
                    // Clean up title
                    title = title.substring(0, 150).replace(/^\W+|\W+$/g, '');
                    
                    // Extract location if mentioned
                    let location = 'West Islip Breast Cancer Coalition Area';
                    const locationKeywords = ['marina', 'hospital', 'lanes', 'center', 'library', 'hall'];
                    for (const locKeyword of locationKeywords) {
                      if (elementText.toLowerCase().includes(locKeyword)) {
                        const locationMatch = elementText.match(new RegExp(`[^.]*${locKeyword}[^.]*`, 'i'));
                        if (locationMatch) {
                          location = locationMatch[0].trim().substring(0, 100);
                          break;
                        }
                      }
                    }
                    
                    // Extract URL
                    let url = '';
                    const linkEl = element.querySelector('a[href]');
                    if (linkEl && linkEl.href && !linkEl.href.includes('javascript:')) {
                      url = linkEl.href;
                    } else {
                      url = window.location.href;
                    }
                    
                    // Determine category based on content
                    let category = 'wibcc - general';
                    if (elementText.toLowerCase().includes('clam')) category = 'wibcc - clam shucking';
                    else if (elementText.toLowerCase().includes('bowl')) category = 'wibcc - bowling';
                    else if (elementText.toLowerCase().includes('ravioli')) category = 'wibcc - ravioli contest';
                    else if (elementText.toLowerCase().includes('screening') || elementText.toLowerCase().includes('mammogram')) category = 'wibcc - health screening';
                    else if (elementText.toLowerCase().includes('pink') || elementText.toLowerCase().includes('awareness')) category = 'wibcc - awareness';
                    else if (elementText.toLowerCase().includes('walk') || elementText.toLowerCase().includes('run')) category = 'wibcc - athletic';
                    else if (elementText.toLowerCase().includes('fundraiser') || elementText.toLowerCase().includes('benefit')) category = 'wibcc - fundraiser';
                    
                    if (title && title.length > 10) {
                      events.push({
                        title_raw: title,
                        description_raw: elementText.substring(0, 400).trim(),
                        start_raw: foundDate,
                        location_raw: location,
                        url_raw: url,
                        category_hint: category,
                        source: 'West Islip Breast Cancer Coalition',
                        fetched_at: new Date().toISOString(),
                        detection_method: 'structured_container'
                      });
                      foundStructuredEvents = true;
                    }
                  }
                }
              });
            }
          }
          
          // If no structured events found, do text pattern analysis
          if (!foundStructuredEvents) {
            console.log('No structured events found, analyzing text patterns...');
            
            // Split text into paragraphs and analyze each
            const paragraphs = allText.split(/\n\n+|\r\n\r\n+/).filter(p => p.trim().length > 30);
            
            paragraphs.forEach(paragraph => {
              const hasEventKeyword = eventKeywords.some(keyword => 
                paragraph.toLowerCase().includes(keyword.toLowerCase())
              );
              
              if (hasEventKeyword) {
                // Look for dates in this paragraph
                for (const pattern of datePatterns) {
                  const matches = paragraph.match(pattern);
                  if (matches && matches.length > 0) {
                    const foundDate = matches[0];
                    
                    // Extract a reasonable title from the paragraph
                    let title = paragraph.split(/[.!?]/)[0].trim();
                    if (title.length > 100) {
                      title = title.substring(0, 100) + '...';
                    }
                    
                    // Determine category
                    let category = 'wibcc - detected event';
                    if (paragraph.toLowerCase().includes('clam')) category = 'wibcc - clam shucking';
                    else if (paragraph.toLowerCase().includes('bowl')) category = 'wibcc - bowling';
                    else if (paragraph.toLowerCase().includes('ravioli')) category = 'wibcc - ravioli contest';
                    else if (paragraph.toLowerCase().includes('screening')) category = 'wibcc - health screening';
                    else if (paragraph.toLowerCase().includes('awareness')) category = 'wibcc - awareness';
                    
                    if (title && title.length > 15) {
                      events.push({
                        title_raw: title,
                        description_raw: paragraph.substring(0, 350).trim(),
                        start_raw: foundDate,
                        location_raw: 'West Islip Breast Cancer Coalition Area',
                        url_raw: window.location.href,
                        category_hint: category,
                        source: 'West Islip Breast Cancer Coalition',
                        fetched_at: new Date().toISOString(),
                        detection_method: 'text_pattern_analysis'
                      });
                    }
                    break; // Only one date per paragraph
                  }
                }
              }
            });
          }
          
          console.log(`Found ${events.length} potential events on this page`);
          return events;
        });
        
        allEvents.push(...pageEvents);
        
      } catch (sourceError) {
        log.warning(`Failed to scrape ${url}: ${sourceError.message}`);
        continue;
      }
      
      // Delay between sources
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
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
    
    log.info(`Extracted ${uniqueEvents.length} unique future events from West Islip Breast Cancer Coalition`);
    if (filteredOutPastEvents > 0) {
      log.info(`Filtered out ${filteredOutPastEvents} past events from WIBCC`);
    }
    
    if (uniqueEvents.length > 0) {
      uniqueEvents.forEach((event, i) => {
        log.info(`WIBCC Event ${i + 1}: "${event.title_raw}" - ${event.start_raw} (${event.detection_method})`);
      });
    } else {
      log.warning('No WIBCC events detected - they may not have posted upcoming events yet');
    }
    
    return uniqueEvents;
    
  } catch (error) {
    log.error('Error scraping West Islip Breast Cancer Coalition:', error.message);
    return [];
  }
}
