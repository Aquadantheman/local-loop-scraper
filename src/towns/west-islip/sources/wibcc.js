// src/towns/west-islip/sources/wibcc.js - Improved for GoDaddy dynamic content
import { log } from 'apify';
import { generateHash } from '../../../utils/hash-generator.js';
import { isEventInFuture } from '../../../utils/date-parser.js';

export async function scrapeWIBCC(page) {
  log.info('=== SCRAPING: West Islip Breast Cancer Coalition (WIBCC) ===');
  
  try {
    const allEvents = [];
    
    // Try main website first
    log.info('🔍 Checking main WIBCC website...');
    await page.goto('https://wibcc.org/', { 
      waitUntil: 'networkidle2',  // Wait for network activity to stop
      timeout: 45000 
    });
    
    // Wait extra time for GoDaddy Website Builder to load content
    log.info('⏳ Waiting for dynamic content to load...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Scroll to trigger any lazy-loaded content
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get all content after JavaScript has loaded
    const mainPageEvents = await page.evaluate(() => {
      const events = [];
      
      // Get all visible text content
      const allText = document.body.innerText || document.body.textContent || '';
      
      console.log('WIBCC Debug: Page text length:', allText.length);
      console.log('WIBCC Debug: First 500 chars:', allText.substring(0, 500));
      
      // Look for event-related content more broadly
      const eventIndicators = [
        'august', 'september', 'october', 'november', 'december',
        'fundraiser', 'event', 'contest', 'clam', 'shucking', 
        'screening', 'awareness', 'coalition', 'benefit',
        '2025', '2026', 'tuesday', 'wednesday', 'thursday', 'friday',
        'marina', 'hospital', 'center'
      ];
      
      // Check if any event indicators are present
      const hasEventContent = eventIndicators.some(indicator => 
        allText.toLowerCase().includes(indicator)
      );
      
      console.log('WIBCC Debug: Has event content:', hasEventContent);
      
      if (hasEventContent) {
        // Split text into sentences and look for event-like content
        const sentences = allText.split(/[.!?]\s+/).filter(s => s.trim().length > 20);
        
        sentences.forEach((sentence, index) => {
          const lowerSentence = sentence.toLowerCase();
          
          // Look for sentences that mention dates and event keywords
          const hasEventKeyword = [
            'clam shucking', 'fundraiser', 'event', 'contest', 'screening',
            'awareness', 'benefit', 'coalition', 'august', 'september', 'october'
          ].some(keyword => lowerSentence.includes(keyword));
          
          // Look for date patterns in this sentence and nearby sentences
          const datePatterns = [
            /\b(?:august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}\b/gi,
            /\b(?:aug|sep|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}\b/gi,
            /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
            /\btuesday,?\s+(?:august|september|october)\s+\d{1,2}(?:st|nd|rd|th)?\b/gi
          ];
          
          let foundDate = '';
          for (const pattern of datePatterns) {
            const match = sentence.match(pattern);
            if (match) {
              foundDate = match[0];
              break;
            }
          }
          
          if (hasEventKeyword && foundDate) {
            // Create event from this sentence
            let title = sentence.split(',')[0].trim();
            if (title.length > 100) {
              title = title.substring(0, 100) + '...';
            }
            
            // Determine category
            let category = 'wibcc - general';
            if (lowerSentence.includes('clam')) category = 'wibcc - clam shucking';
            else if (lowerSentence.includes('screening')) category = 'wibcc - health screening';
            else if (lowerSentence.includes('awareness')) category = 'wibcc - awareness';
            else if (lowerSentence.includes('fundraiser')) category = 'wibcc - fundraiser';
            
            events.push({
              title_raw: title,
              description_raw: sentence.trim(),
              start_raw: foundDate,
              location_raw: 'West Islip Breast Cancer Coalition Area',
              url_raw: window.location.href,
              category_hint: category,
              source: 'West Islip Breast Cancer Coalition',
              fetched_at: new Date().toISOString(),
              detection_method: 'dynamic_content_analysis'
            });
            
            console.log(`WIBCC Debug: Found event - "${title}" on ${foundDate}`);
          }
        });
      }
      
      // Also look for any elements that might contain event info
      const allElements = document.querySelectorAll('*');
      Array.from(allElements).forEach(element => {
        const elementText = element.textContent || '';
        
        if (elementText.length > 50 && elementText.length < 500) {
          const lowerText = elementText.toLowerCase();
          
          // Check for specific WIBCC events we know about
          if (lowerText.includes('clam shucking') || 
              lowerText.includes('31st') || 
              lowerText.includes('32nd') ||
              lowerText.includes('august 12')) {
            
            // Look for date in this element
            const dateMatch = elementText.match(/(?:august|aug)\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}/gi);
            
            if (dateMatch) {
              events.push({
                title_raw: 'Annual Clam Shucking Fundraising Event',
                description_raw: elementText.trim(),
                start_raw: dateMatch[0],
                location_raw: 'Bay Shore Marina, Bay Shore, NY',
                url_raw: window.location.href,
                category_hint: 'wibcc - clam shucking',
                source: 'West Islip Breast Cancer Coalition',
                fetched_at: new Date().toISOString(),
                detection_method: 'element_text_analysis'
              });
              
              console.log(`WIBCC Debug: Found clam shucking event from element`);
            }
          }
        }
      });
      
      console.log(`WIBCC Debug: Total events found: ${events.length}`);
      return events;
    });
    
    allEvents.push(...mainPageEvents);
    
    // If no events found on main page, try to look for Facebook or other social links
    if (allEvents.length === 0) {
      log.info('🔍 No events found on main page, checking for social media links...');
      
      const socialLinks = await page.evaluate(() => {
        const links = [];
        const allLinks = document.querySelectorAll('a[href]');
        
        Array.from(allLinks).forEach(link => {
          const href = link.href || '';
          if (href.includes('facebook.com') || 
              href.includes('instagram.com') || 
              href.includes('eventbrite.com')) {
            links.push(href);
          }
        });
        
        return links;
      });
      
      log.info(`Found ${socialLinks.length} social media links: ${socialLinks.join(', ')}`);
      
      // If they have Facebook, that's likely where events are posted
      if (socialLinks.some(link => link.includes('facebook.com'))) {
        // Add a placeholder event indicating where to find current events
        allEvents.push({
          title_raw: 'WIBCC Events - Check Facebook for Current Schedule',
          description_raw: 'The West Islip Breast Cancer Coalition posts their current events and announcements on their Facebook page. Follow them for the latest fundraising events, health screenings, and community activities.',
          start_raw: 'Ongoing',
          location_raw: 'Various Locations',
          url_raw: 'https://wibcc.org/',
          category_hint: 'wibcc - info',
          source: 'West Islip Breast Cancer Coalition',
          fetched_at: new Date().toISOString(),
          detection_method: 'social_media_reference'
        });
      }
    }
    
    // Process and filter events
    const uniqueEvents = [];
    const seenHashes = new Set();
    let filteredOutPastEvents = 0;
    
    allEvents.forEach(event => {
      event.hash = generateHash(event.title_raw, event.start_raw, event.description_raw, event.source);
      
      // For "Ongoing" events or events without specific dates, always include them
      if (event.start_raw === 'Ongoing' || !event.start_raw || isEventInFuture(event.start_raw)) {
        if (!seenHashes.has(event.hash)) {
          seenHashes.add(event.hash);
          uniqueEvents.push(event);
        }
      } else {
        filteredOutPastEvents++;
      }
    });
    
    log.info(`Extracted ${uniqueEvents.length} unique events from West Islip Breast Cancer Coalition`);
    if (filteredOutPastEvents > 0) {
      log.info(`Filtered out ${filteredOutPastEvents} past events from WIBCC`);
    }
    
    if (uniqueEvents.length > 0) {
      uniqueEvents.forEach((event, i) => {
        log.info(`WIBCC Event ${i + 1}: "${event.title_raw}" - ${event.start_raw} (${event.detection_method})`);
      });
    } else {
      log.warning('No WIBCC events detected - their website may not have current events posted or content is heavily JavaScript-dependent');
    }
    
    return uniqueEvents;
    
  } catch (error) {
    log.error('Error scraping West Islip Breast Cancer Coalition:', error.message);
    return [];
  }
}
