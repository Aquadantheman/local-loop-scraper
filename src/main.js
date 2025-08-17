// src/main.js - Local Loop Event Scraper (Improved)
import { Actor, log } from 'apify';
import { launchPuppeteer } from 'crawlee';
import { scrapeWestIslip } from './towns/west-islip/index.js';
import { sendToAirtable, verifyAirtableSetup } from './utils/airtable.js';
import { parseEventDate } from './utils/date-parser.js';

await Actor.main(async () => {
  const input = await Actor.getInput() ?? {};
  
  // Enhanced input validation
  const config = {
    debug: input.debug || false,
    maxEvents: Math.min(input.maxEvents || 500, 2000),
    towns: input.towns || ['West Islip'],
    futureOnly: input.futureOnly !== false, // Default true
    batchSize: 10, // For Airtable uploads
    retryAttempts: 3
  };
  
  // Environment setup with validation
  const hasAirtableToken = !!process.env.AIRTABLE_TOKEN;
  const hasAirtableBase = !!process.env.AIRTABLE_BASE_ID;
  
  log.info('🚀 Starting Local Loop Multi-Town Event Scraper v1.1');
  log.info(`🏘️ Architecture: Modular (ready for expansion)`);
  log.info(`🛠 Debug mode: ${config.debug ? 'ON' : 'OFF'}`);
  log.info(`📊 Max events: ${config.maxEvents}`);
  log.info(`🔮 Future only: ${config.futureOnly ? 'YES' : 'NO'}`);
  log.info(`📋 Airtable integration: ${hasAirtableToken && hasAirtableBase ? 'ENABLED' : 'DISABLED'}`);
  
  // Verify Airtable setup early
  let airtableReady = false;
  if (hasAirtableToken && hasAirtableBase) {
    airtableReady = await verifyAirtableSetup(process.env.AIRTABLE_TOKEN, process.env.AIRTABLE_BASE_ID);
    if (!airtableReady) {
      log.warning('⚠️ Airtable verification failed - will save to dataset only');
    }
  } else {
    log.info('ℹ️ Airtable credentials not provided - using dataset only');
  }

  let browser;
  try {
    // Initialize browser with better error handling
    log.info('🌐 Launching browser with optimized settings...');
    
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
          '--disable-renderer-backgrounding'
        ]
      }
    });
    
    const page = await browser.newPage();
    
    // Enhanced page setup
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    
    // Block unnecessary resources for faster scraping
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
    
    // Configure towns to scrape (easily expandable!)
    const townConfig = [
      {
        name: 'West Islip',
        scraper: scrapeWestIslip,
        enabled: config.towns.includes('West Islip'),
        expectedEventCount: 100, // For validation
        timeout: 300000 // 5 minutes max per town
      }
      // Future towns can be added here:
      // { name: 'East Islip', scraper: scrapeEastIslip, enabled: false }
    ];
    
    const enabledTowns = townConfig.filter(t => t.enabled);
    log.info(`📍 Scraping ${enabledTowns.length} enabled towns: ${enabledTowns.map(t => t.name).join(', ')}`);
    
    // Scrape each enabled town with enhanced error handling
    for (const [index, town] of enabledTowns.entries()) {
      const townStartTime = Date.now();
      
      try {
        log.info(`\n🏘️ Scraping ${town.name} (${index + 1}/${enabledTowns.length})`);
        log.info(`⏱️ Town timeout: ${Math.round(town.timeout / 1000)}s`);
        
        // Set timeout for town scraping
        const townPromise = town.scraper(page);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Town scraping timeout after ${town.timeout}ms`)), town.timeout)
        );
        
        const townEvents = await Promise.race([townPromise, timeoutPromise]);
        
        // Validate results
        if (!Array.isArray(townEvents)) {
          throw new Error(`Scraper returned invalid data type: ${typeof townEvents}`);
        }
        
        // Apply event limit per town
        const limitedEvents = townEvents.slice(0, Math.floor(config.maxEvents / enabledTowns.length));
        allEvents = allEvents.concat(limitedEvents);
        
        const scrapingTime = Math.round((Date.now() - townStartTime) / 1000);
        
        scrapingResults[town.name] = { 
          success: true, 
          count: limitedEvents.length,
          originalCount: townEvents.length,
          sources: getTownSourceBreakdown(limitedEvents),
          scrapingTimeSeconds: scrapingTime
        };
        
        log.info(`✅ ${town.name}: ${limitedEvents.length} events collected in ${scrapingTime}s`);
        
        // Validate event count vs expectations
        if (limitedEvents.length < (town.expectedEventCount * 0.3)) {
          log.warning(`⚠️ ${town.name}: Event count (${limitedEvents.length}) below expected minimum (${Math.round(town.expectedEventCount * 0.3)})`);
        }
        
        // Apply event count limit across all towns
        if (allEvents.length >= config.maxEvents) {
          log.info(`🛑 Reached maximum event limit (${config.maxEvents}), stopping collection`);
          break;
        }
        
        // Respectful delay between towns
        if (index < enabledTowns.length - 1) {
          log.info('⏸️ Brief delay before next town...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
      } catch (townError) {
        const scrapingTime = Math.round((Date.now() - townStartTime) / 1000);
        log.error(`❌ Error scraping ${town.name} after ${scrapingTime}s: ${townError.message}`);
        
        scrapingResults[town.name] = { 
          success: false, 
          error: townError.message,
          scrapingTimeSeconds: scrapingTime
        };
        
        // Continue with other towns
        log.info('🔄 Continuing with remaining towns...');
      }
    }
    
    // Process and display results
    await processResults(allEvents, scrapingResults, airtableReady, config);
    
  } catch (error) {
    await handleCriticalError(error, allEvents || [], scrapingResults || {});
  } finally {
    if (browser) {
      await browser.close();
      log.info('📚 Browser closed - scraping complete');
    }
  }
});

// Helper function to get source breakdown for a town
function getTownSourceBreakdown(events) {
  return events.reduce((acc, event) => {
    acc[event.source] = (acc[event.source] || 0) + 1;
    return acc;
  }, {});
}

// Enhanced results processing
async function processResults(allEvents, scrapingResults, airtableReady, config) {
  const totalStartTime = Date.now();
  
  // Enhanced results summary
  log.info(`\n📊 SCRAPING SUMMARY`);
  log.info(`📈 Total events found: ${allEvents.length}`);
  log.info(`🎯 Event limit: ${config.maxEvents}`);
  log.info(`🔮 Future only filter: ${config.futureOnly ? 'ENABLED' : 'DISABLED'}`);
  
  // Detailed town results
  Object.entries(scrapingResults).forEach(([town, result]) => {
    const status = result.success ? '✅' : '❌';
    if (result.success) {
      log.info(`${status} ${town}: ${result.count} events (${result.scrapingTimeSeconds}s)`);
      if (result.originalCount && result.originalCount > result.count) {
        log.info(`    📝 Limited from ${result.originalCount} to ${result.count} events`);
      }
      if (result.sources) {
        Object.entries(result.sources).forEach(([source, count]) => {
          log.info(`    📍 ${source}: ${count} events`);
        });
      }
    } else {
      log.info(`${status} ${town}: Error after ${result.scrapingTimeSeconds}s - ${result.error}`);
    }
  });
  
  if (allEvents.length === 0) {
    log.warning('⚠️ No events found to process');
    await Actor.setValue('LATEST_SCRAPE', {
      scraped_at: new Date().toISOString(),
      total_events_found: 0,
      scraping_results: scrapingResults,
      success: false,
      error: 'No events found'
    });
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
  log.info('\n📅 Sorting events chronologically...');
  processedEvents.sort((a, b) => {
    const dateA = parseEventDate(a.start_raw);
    const dateB = parseEventDate(b.start_raw);
    return dateA.getTime() - dateB.getTime();
  });
  
  // Show sample upcoming events with better formatting
  log.info('\n🎪 Upcoming events preview:');
  processedEvents.slice(0, 8).forEach((event, i) => {
    const eventDate = parseEventDate(event.start_raw);
    const dateStr = eventDate.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      hour: eventDate.getHours() ? 'numeric' : undefined,
      minute: eventDate.getMinutes() ? 'numeric' : undefined
    });
    log.info(`${String(i + 1).padStart(2)}. ${dateStr} - ${event.title_raw.substring(0, 60)}${event.title_raw.length > 60 ? '...' : ''}`);
    log.info(`    🏛️ ${event.location_raw} (${event.source})`);
  });
  
  // Save to Apify dataset
  await Actor.pushData(processedEvents);
  log.info(`💾 Saved ${processedEvents.length} events to Apify dataset`);
  
  // Enhanced Airtable integration
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
  
  // Enhanced statistics storage
  const totalProcessingTime = Math.round((Date.now() - totalStartTime) / 1000);
  
  await Actor.setValue('LATEST_SCRAPE', {
    scraped_at: new Date().toISOString(),
    total_events_found: allEvents.length,
    events_after_filtering: processedEvents.length,
    filtered_out_past_events: filteredOutPastEvents,
    scraping_results: scrapingResults,
    events_by_source: getTownSourceBreakdown(processedEvents),
    airtable_integration: airtableReady,
    total_processing_time_seconds: totalProcessingTime,
    config_used: config,
    success: true,
    architecture: 'modular_v1.1',
    towns_scraped: Object.keys(scrapingResults)
  });
  
  // Success message with metrics
  log.info('\n🎉 SCRAPING COMPLETED SUCCESSFULLY!');
  log.info(`📈 Collected ${processedEvents.length} events from ${Object.keys(scrapingResults).length} towns`);
  log.info(`⏱️ Total processing time: ${totalProcessingTime}s`);
  if (airtableReady) {
    log.info('💫 Airtable integration completed');
  }
  log.info(`🔗 Dataset URL: https://console.apify.com/storage/datasets/${process.env.APIFY_DEFAULT_DATASET_ID || 'latest'}`);
}

// Enhanced error handling
async function handleCriticalError(error, allEvents, scrapingResults) {
  log.error('💥 Critical scraping error:', error.message);
  
  // More detailed error logging
  if (error.stack) {
    log.error('Stack trace:', error.stack);
  }
  
  // Save partial results if any
  if (allEvents.length > 0) {
    await Actor.pushData(allEvents);
    log.info(`💾 Saved ${allEvents.length} partial results to dataset`);
  }
  
  // Enhanced error details storage
  await Actor.setValue('LATEST_ERROR', {
    error_at: new Date().toISOString(),
    error_message: error.message,
    error_stack: error.stack,
    error_type: error.constructor.name,
    events_collected: allEvents.length,
    scraping_results: scrapingResults,
    actor_version: '1.1.0'
  });
  
  // Exit with error code
  process.exit(1);
}

// Helper function for future event filtering
function isEventInFuture(dateString) {
  if (!dateString) return true; // Include events with no date
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDate = parseEventDate(dateString);
  
  return eventDate >= today;
}
