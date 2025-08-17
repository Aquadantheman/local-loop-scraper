// src/main.js - Memory-Optimized Local Loop Scraper
import { Actor, log } from 'apify';
import { chromium } from 'playwright';
import { scrapeWestIslip } from './towns/west-islip/index.js';
import { sendToAirtable, verifyAirtableSetup } from './utils/airtable.js';
import { parseEventDate } from './utils/date-parser.js';

await Actor.main(async () => {
  const input = await Actor.getInput() ?? {};
  
  // Optimized configuration
  const config = {
    debug: input.debug || false,
    maxEvents: Math.min(input.maxEvents || 300, 1000), // Reduced default
    towns: input.towns || ['West Islip'],
    futureOnly: input.futureOnly !== false,
    timeout: 60000 // 1 minute per source
  };
  
  const hasAirtableToken = !!process.env.AIRTABLE_TOKEN;
  const hasAirtableBase = !!process.env.AIRTABLE_BASE_ID;
  
  log.info('🚀 Starting Local Loop Scraper (Memory Optimized)');
  log.info(`🛠 Debug: ${config.debug}, Max events: ${config.maxEvents}`);
  log.info(`📋 Airtable: ${hasAirtableToken && hasAirtableBase ? 'ENABLED' : 'DISABLED'}`);
  
  // Verify Airtable early to avoid wasted scraping
  let airtableReady = false;
  if (hasAirtableToken && hasAirtableBase) {
    airtableReady = await verifyAirtableSetup(process.env.AIRTABLE_TOKEN, process.env.AIRTABLE_BASE_ID);
  }

  let browser;
  let allEvents = [];
  const scrapingResults = {};
  
  try {
    log.info('🌐 Launching optimized browser...');
    
    // Use Playwright for better performance
    browser = await chromium.launch({
      headless: !config.debug,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-background-timer-throttling',
        '--force-color-profile=srgb',
        '--memory-pressure-off',
        '--max-old-space-size=1024'
      ]
    });
    
    // Create a single browser context
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 }
    });
    
    // Enable request blocking for faster loading
    await context.route('**/*', route => {
      const resourceType = route.request().resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });
    
    const page = await context.newPage();
    
    // Configure towns (easily expandable)
    const towns = [
      {
        name: 'West Islip',
        scraper: scrapeWestIslip,
        enabled: config.towns.includes('West Islip')
      }
    ];
    
    const enabledTowns = towns.filter(t => t.enabled);
    log.info(`📍 Scraping ${enabledTowns.length} towns`);
    
    // Scrape each town with memory management
    for (const [index, town] of enabledTowns.entries()) {
      if (!town.enabled) continue;
      
      const townStartTime = Date.now();
      
      try {
        log.info(`🏘️ Scraping ${town.name} (${index + 1}/${enabledTowns.length})`);
        
        // Set timeout for town
        const townPromise = town.scraper(page);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Town timeout')), config.timeout * 5) // 5 minutes max per town
        );
        
        const townEvents = await Promise.race([townPromise, timeoutPromise]);
        
        if (!Array.isArray(townEvents)) {
          throw new Error(`Invalid data type: ${typeof townEvents}`);
        }
        
        // Apply limits early to save memory
        const limitedEvents = townEvents.slice(0, config.maxEvents);
        allEvents = allEvents.concat(limitedEvents);
        
        const scrapingTime = Math.round((Date.now() - townStartTime) / 1000);
        
        scrapingResults[town.name] = { 
          success: true, 
          count: limitedEvents.length,
          originalCount: townEvents.length,
          scrapingTimeSeconds: scrapingTime
        };
        
        log.info(`✅ ${town.name}: ${limitedEvents.length} events (${scrapingTime}s)`);
        
        // Memory cleanup between towns
        if (global.gc) {
          global.gc();
        }
        
        // Brief pause between towns
        if (index < enabledTowns.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (townError) {
        const scrapingTime = Math.round((Date.now() - townStartTime) / 1000);
        log.error(`❌ ${town.name} error after ${scrapingTime}s: ${townError.message}`);
        
        scrapingResults[town.name] = { 
          success: false, 
          error: townError.message,
          scrapingTimeSeconds: scrapingTime
        };
      }
    }
    
    // Close browser context to free memory
    await context.close();
    
    // Process results
    await processResults(allEvents, scrapingResults, airtableReady, config);
    
  } catch (error) {
    await handleCriticalError(error, allEvents, scrapingResults);
  } finally {
    if (browser) {
      await browser.close();
      log.info('📚 Browser closed');
    }
  }
});

// Streamlined results processing
async function processResults(allEvents, scrapingResults, airtableReady, config) {
  log.info(`\n📊 RESULTS: ${allEvents.length} total events`);
  
  // Show town breakdown
  Object.entries(scrapingResults).forEach(([town, result]) => {
    const status = result.success ? '✅' : '❌';
    if (result.success) {
      log.info(`${status} ${town}: ${result.count} events (${result.scrapingTimeSeconds}s)`);
    } else {
      log.info(`${status} ${town}: ${result.error}`);
    }
  });
  
  if (allEvents.length === 0) {
    log.warning('⚠️ No events found');
    return;
  }
  
  // Apply future filter if enabled
  let processedEvents = allEvents;
  if (config.futureOnly) {
    processedEvents = allEvents.filter(event => isEventInFuture(event.start_raw));
    log.info(`📅 Future events: ${processedEvents.length}/${allEvents.length}`);
  }
  
  // Sort chronologically
  processedEvents.sort((a, b) => {
    const dateA = parseEventDate(a.start_raw);
    const dateB = parseEventDate(b.start_raw);
    return dateA.getTime() - dateB.getTime();
  });
  
  // Show sample events
  log.info('\n🎪 Sample upcoming events:');
  processedEvents.slice(0, 5).forEach((event, i) => {
    log.info(`${i + 1}. ${event.title_raw.substring(0, 50)} (${event.source})`);
  });
  
  // Save to dataset
  await Actor.pushData(processedEvents);
  log.info(`💾 Saved ${processedEvents.length} events to dataset`);
  
  // Airtable integration
  if (airtableReady && processedEvents.length > 0) {
    log.info('📤 Sending to Airtable...');
    try {
      const airtableResult = await sendToAirtable(processedEvents);
      log.info(`📊 Airtable: ${airtableResult.sent} sent`);
    } catch (airtableError) {
      log.error(`❌ Airtable failed: ${airtableError.message}`);
    }
  }
  
  // Store minimal statistics
  await Actor.setValue('LATEST_SCRAPE', {
    scraped_at: new Date().toISOString(),
    total_events: processedEvents.length,
    towns: Object.keys(scrapingResults),
    success: true
  });
  
  log.info(`\n🎉 COMPLETED: ${processedEvents.length} events processed`);
}

// Simplified error handling
async function handleCriticalError(error, allEvents, scrapingResults) {
  log.error('💥 Critical error:', error.message);
  
  if (allEvents.length > 0) {
    await Actor.pushData(allEvents);
    log.info(`💾 Saved ${allEvents.length} partial results`);
  }
  
  await Actor.setValue('LATEST_ERROR', {
    error_at: new Date().toISOString(),
    error_message: error.message,
    events_collected: allEvents.length
  });
  
  process.exit(1);
}

// Simple future event check
function isEventInFuture(dateString) {
  if (!dateString) return true;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDate = parseEventDate(dateString);
  return eventDate >= today;
}
