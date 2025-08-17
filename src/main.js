// src/main.js - Local Loop Event Scraper (Optimized but Compatible)
import { Actor, log } from 'apify';
import { launchPuppeteer } from 'crawlee';
import { scrapeWestIslip } from './towns/west-islip/index.js';
import { sendToAirtable, verifyAirtableSetup } from './utils/airtable.js';
import { parseEventDate } from './utils/date-parser.js';

await Actor.main(async () => {
  const input = await Actor.getInput() ?? {};
  
  // Optimized configuration
  const config = {
    debug: input.debug || false,
    maxEvents: Math.min(input.maxEvents || 400, 2000), // Slightly reduced default
    towns: input.towns || ['West Islip'],
    futureOnly: input.futureOnly !== false
  };
  
  const hasAirtableToken = !!process.env.AIRTABLE_TOKEN;
  const hasAirtableBase = !!process.env.AIRTABLE_BASE_ID;
  
  log.info('🚀 Starting Local Loop Event Scraper (Optimized)');
  log.info(`🛠 Debug: ${config.debug}, Max events: ${config.maxEvents}`);
  log.info(`📋 Airtable: ${hasAirtableToken && hasAirtableBase ? 'ENABLED' : 'DISABLED'}`);
  
  // Verify Airtable setup early
  let airtableReady = false;
  if (hasAirtableToken && hasAirtableBase) {
    airtableReady = await verifyAirtableSetup(process.env.AIRTABLE_TOKEN, process.env.AIRTABLE_BASE_ID);
    if (!airtableReady) {
      log.warning('⚠️ Airtable verification failed - will save to dataset only');
    }
  }

  let browser;
  try {
    log.info('🌐 Launching optimized browser...');
    
    // Use your existing Puppeteer setup but with optimizations
    browser = await launchPuppeteer({
      launchOptions: {
        headless: !config.debug,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-extensions',
          '--disable-gpu',
          '--no-first-run',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--memory-pressure-off',
          '--max-old-space-size=1024'
        ]
      }
    });
    
    const page = await browser.newPage();
    
    // Optimize page settings
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 720 });
    
    // Block unnecessary resources for faster loading
    if (!config.debug) {
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if(['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });
    }
    
    let allEvents = [];
    const scrapingResults = {};
    
    // Configure towns
    const towns = [
      {
        name: 'West Islip',
        scraper: scrapeWestIslip,
        enabled: config.towns.includes('West Islip'),
        timeout: 300000 // 5 minutes max per town
      }
    ];
    
    const enabledTowns = towns.filter(t => t.enabled);
    log.info(`📍 Scraping ${enabledTowns.length} enabled towns`);
    
    // Scrape each enabled town with better error handling
    for (const [index, town] of enabledTowns.entries()) {
      const townStartTime = Date.now();
      
      try {
        log.info(`🏘️ Scraping ${town.name} (${index + 1}/${enabledTowns.length})`);
        
        // Set timeout for town scraping
        const townPromise = town.scraper(page);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Town scraping timeout after ${town.timeout}ms`)), town.timeout)
        );
        
        const townEvents = await Promise.race([townPromise, timeoutPromise]);
        
        if (!Array.isArray(townEvents)) {
          throw new Error(`Scraper returned invalid data type: ${typeof townEvents}`);
        }
        
        // Apply event limit per town to save memory
        const limitedEvents = townEvents.slice(0, Math.floor(config.maxEvents / enabledTowns.length));
        allEvents = allEvents.concat(limitedEvents);
        
        const scrapingTime = Math.round((Date.now() - townStartTime) / 1000);
        
        scrapingResults[town.name] = { 
          success: true, 
          count: limitedEvents.length,
          originalCount: townEvents.length,
          scrapingTimeSeconds: scrapingTime
        };
        
        log.info(`✅ ${town.name}: ${limitedEvents.length} events in ${scrapingTime}s`);
        
        // Apply global event limit
        if (allEvents.length >= config.maxEvents) {
          log.info(`🛑 Reached maximum event limit (${config.maxEvents})`);
          break;
        }
        
        // Memory cleanup and delay between towns
        if (index < enabledTowns.length - 1) {
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (townError) {
        const scrapingTime = Math.round((Date.now() - townStartTime) / 1000);
        log.error(`❌ Error scraping ${town.name} after ${scrapingTime}s: ${townError.message}`);
        
        scrapingResults[town.name] = { 
          success: false, 
          error: townError.message,
          scrapingTimeSeconds: scrapingTime
        };
      }
    }
    
    // Process results
    await processResults(allEvents, scrapingResults, airtableReady, config);
    
  } catch (error) {
    await handleCriticalError(error, allEvents || [], scrapingResults || {});
  } finally {
    if (browser) {
      await browser.close();
      log.info('📚 Browser closed');
    }
  }
});

// Streamlined results processing
async function processResults(allEvents, scrapingResults, airtableReady, config) {
  log.info(`\n📊 SCRAPING SUMMARY`);
  log.info(`📈 Total events found: ${allEvents.length}`);
  
  // Show town results
  Object.entries(scrapingResults).forEach(([town, result]) => {
    const status = result.success ? '✅' : '❌';
    if (result.success) {
      log.info(`${status} ${town}: ${result.count} events (${result.scrapingTimeSeconds}s)`);
      if (result.originalCount && result.originalCount > result.count) {
        log.info(`    📝 Limited from ${result.originalCount} to ${result.count} events`);
      }
    } else {
      log.info(`${status} ${town}: Error - ${result.error}`);
    }
  });
  
  if (allEvents.length === 0) {
    log.warning('⚠️ No events found to process');
    return;
  }
  
  // Apply future-only filter if enabled
  let processedEvents = allEvents;
  let filteredOutPastEvents = 0;
  
  if (config.futureOnly) {
    const futureEvents = [];
    allEvents.forEach(event => {
      if (isEventInFuture(event.start_raw)) {
        futureEvents.push(event);
      } else {
        filteredOutPastEvents++;
      }
    });
    processedEvents = futureEvents;
    
    if (filteredOutPastEvents > 0) {
      log.info(`🗓️ Filtered out ${filteredOutPastEvents} past events`);
      log.info(`📅 Remaining future events: ${processedEvents.length}`);
    }
  }
  
  if (processedEvents.length === 0) {
    log.warning('⚠️ No future events found after filtering');
    return;
  }
  
  // Sort events chronologically
  log.info('📅 Sorting events chronologically...');
  processedEvents.sort((a, b) => {
    const dateA = parseEventDate(a.start_raw);
    const dateB = parseEventDate(b.start_raw);
    return dateA.getTime() - dateB.getTime();
  });
  
  // Show sample upcoming events
  log.info('\n🎪 Upcoming events preview:');
  processedEvents.slice(0, 6).forEach((event, i) => {
    const eventDate = parseEventDate(event.start_raw);
    const dateStr = eventDate.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric'
    });
    log.info(`${String(i + 1).padStart(2)}. ${dateStr} - ${event.title_raw.substring(0, 50)}${event.title_raw.length > 50 ? '...' : ''}`);
    log.info(`    🏛️ ${event.location_raw} (${event.source})`);
  });
  
  // Save to Apify dataset
  await Actor.pushData(processedEvents);
  log.info(`💾 Saved ${processedEvents.length} events to Apify dataset`);
  
  // Airtable integration
  if (airtableReady) {
    log.info('\n📤 Sending events to Airtable...');
    try {
      const airtableResult = await sendToAirtable(processedEvents);
      log.info(`📊 Airtable result: ${airtableResult.sent} sent, ${airtableResult.skipped || 0} skipped`);
    } catch (airtableError) {
      log.error(`❌ Airtable integration failed: ${airtableError.message}`);
    }
  } else {
    log.warning('⚠️ Skipping Airtable integration - setup not verified');
  }
  
  // Store statistics
  await Actor.setValue('LATEST_SCRAPE', {
    scraped_at: new Date().toISOString(),
    total_events_found: allEvents.length,
    events_after_filtering: processedEvents.length,
    filtered_out_past_events: filteredOutPastEvents,
    scraping_results: scrapingResults,
    config_used: config,
    success: true,
    towns_scraped: Object.keys(scrapingResults)
  });
  
  log.info('\n🎉 SCRAPING COMPLETED SUCCESSFULLY!');
  log.info(`📈 Processed ${processedEvents.length} events from ${Object.keys(scrapingResults).length} towns`);
  if (airtableReady) {
    log.info('💫 Airtable integration completed');
  }
}

// Error handling
async function handleCriticalError(error, allEvents, scrapingResults) {
  log.error('💥 Critical scraping error:', error.message);
  
  if (allEvents.length > 0) {
    await Actor.pushData(allEvents);
    log.info(`💾 Saved ${allEvents.length} partial results to dataset`);
  }
  
  await Actor.setValue('LATEST_ERROR', {
    error_at: new Date().toISOString(),
    error_message: error.message,
    events_collected: allEvents.length,
    scraping_results: scrapingResults
  });
  
  process.exit(1);
}

// Future event check
function isEventInFuture(dateString) {
  if (!dateString) return true;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDate = parseEventDate(dateString);
  return eventDate >= today;
}
