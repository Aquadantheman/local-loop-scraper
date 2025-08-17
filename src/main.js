// src/main.js - Complete Local Loop Event Scraper (All Working)
import { Actor, log } from 'apify';
import puppeteer from 'puppeteer';
import { scrapeWestIslip } from './towns/west-islip/index.js';
import { sendToAirtable, verifyAirtableSetup } from './utils/airtable.js';
import { parseEventDate } from './utils/date-parser.js';

await Actor.main(async () => {
  const input = await Actor.getInput() ?? {};
  
  const config = {
    debug: input.debug || false,
    maxEvents: Math.min(input.maxEvents || 400, 2000),
    towns: input.towns || ['West Islip'],
    futureOnly: input.futureOnly !== false
  };
  
  const hasAirtableToken = !!process.env.AIRTABLE_TOKEN;
  const hasAirtableBase = !!process.env.AIRTABLE_BASE_ID;
  
  log.info('🚀 Starting Local Loop Event Scraper (Complete)');
  log.info(`🛠 Debug: ${config.debug}, Max events: ${config.maxEvents}`);
  log.info(`📋 Airtable: ${hasAirtableToken && hasAirtableBase ? 'ENABLED' : 'DISABLED'}`);
  
  // Verify Airtable setup (but don't fail if it's not working)
  let airtableReady = false;
  if (hasAirtableToken && hasAirtableBase) {
    try {
      airtableReady = await verifyAirtableSetup(process.env.AIRTABLE_TOKEN, process.env.AIRTABLE_BASE_ID);
    } catch (airtableError) {
      log.warning(`⚠️ Airtable verification failed: ${airtableError.message}`);
      log.info('📊 Will save to dataset only');
    }
  }

  let browser;
  try {
    log.info('🌐 Launching browser...');
    
    browser = await puppeteer.launch({
      headless: !config.debug,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-gpu',
        '--no-first-run'
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Enable resource blocking for faster performance
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
        enabled: config.towns.includes('West Islip')
      }
    ];
    
    const enabledTowns = towns.filter(t => t.enabled);
    log.info(`📍 Scraping ${enabledTowns.length} enabled towns`);
    
    // Scrape each town
    for (const [index, town] of enabledTowns.entries()) {
      const townStartTime = Date.now();
      
      try {
        log.info(`🏘️ Scraping ${town.name} (${index + 1}/${enabledTowns.length})`);
        
        const townEvents = await town.scraper(page);
        
        if (!Array.isArray(townEvents)) {
          throw new Error(`Invalid data type: ${typeof townEvents}`);
        }
        
        allEvents = allEvents.concat(townEvents);
        
        const scrapingTime = Math.round((Date.now() - townStartTime) / 1000);
        
        scrapingResults[town.name] = { 
          success: true, 
          count: townEvents.length,
          scrapingTimeSeconds: scrapingTime,
          sources: getTownSourceBreakdown(townEvents)
        };
        
        log.info(`✅ ${town.name}: ${townEvents.length} events in ${scrapingTime}s`);
        
        // Brief delay between towns
        if (index < enabledTowns.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (townError) {
        const scrapingTime = Math.round((Date.now() - townStartTime) / 1000);
        log.error(`❌ Error scraping ${town.name}: ${townError.message}`);
        
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
    log.error('💥 Critical error:', error.message);
    if (allEvents && allEvents.length > 0) {
      await Actor.pushData(allEvents);
      log.info(`💾 Saved ${allEvents.length} partial results`);
    }
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      log.info('📚 Browser closed');
    }
  }
});

// Helper function to get source breakdown
function getTownSourceBreakdown(events) {
  return events.reduce((acc, event) => {
    acc[event.source] = (acc[event.source] || 0) + 1;
    return acc;
  }, {});
}

async function processResults(allEvents, scrapingResults, airtableReady, config) {
  log.info(`\n📊 SCRAPING SUMMARY`);
  log.info(`📈 Total events found: ${allEvents.length}`);
  
  // Show detailed town results
  Object.entries(scrapingResults).forEach(([town, result]) => {
    const status = result.success ? '✅' : '❌';
    if (result.success) {
      log.info(`${status} ${town}: ${result.count} events (${result.scrapingTimeSeconds}s)`);
      if (result.sources) {
        Object.entries(result.sources).forEach(([source, count]) => {
          log.info(`    📍 ${source}: ${count} events`);
        });
      }
    } else {
      log.info(`${status} ${town}: ${result.error}`);
    }
  });
  
  if (allEvents.length === 0) {
    log.warning('⚠️ No events found');
    return;
  }
  
  // Filter future events
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
    }
    log.info(`📅 Future events: ${processedEvents.length}`);
  }
  
  if (processedEvents.length === 0) {
    log.warning('⚠️ No future events found after filtering');
    return;
  }
  
  // Sort chronologically
  log.info('📅 Sorting events chronologically...');
  processedEvents.sort((a, b) => {
    const dateA = parseEventDate(a.start_raw);
    const dateB = parseEventDate(b.start_raw);
    return dateA.getTime() - dateB.getTime();
  });
  
  // Show sample upcoming events
  log.info('\n🎪 Upcoming events preview:');
  processedEvents.slice(0, 8).forEach((event, i) => {
    const eventDate = parseEventDate(event.start_raw);
    const dateStr = eventDate.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric'
    });
    log.info(`${String(i + 1).padStart(2)}. ${dateStr} - ${event.title_raw.substring(0, 50)}${event.title_raw.length > 50 ? '...' : ''}`);
    log.info(`    🏛️ ${event.location_raw} (${event.source})`);
  });
  
  // Save to dataset
  await Actor.pushData(processedEvents);
  log.info(`💾 Saved ${processedEvents.length} events to Apify dataset`);
  
  // Airtable integration
  if (airtableReady && processedEvents.length > 0) {
    log.info('\n📤 Sending events to Airtable...');
    try {
      const airtableResult = await sendToAirtable(processedEvents);
      log.info(`📊 Airtable result: ${airtableResult.sent} sent, ${airtableResult.skipped || 0} skipped`);
    } catch (airtableError) {
      log.error(`❌ Airtable integration failed: ${airtableError.message}`);
    }
  } else if (!airtableReady) {
    log.info('📊 Airtable integration skipped - not configured or verification failed');
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
  log.info(`🔗 Dataset saved for newsletter generation`);
}

function isEventInFuture(dateString) {
  if (!dateString) return true;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDate = parseEventDate(dateString);
  return eventDate >= today;
}
