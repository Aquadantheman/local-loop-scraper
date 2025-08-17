// src/main.js - Local Loop Event Scraper (Use Apify's browser method)
import { Actor, log } from 'apify';
import { launchPuppeteer } from 'crawlee';
import { scrapeWestIslip } from './towns/west-islip/index.js';
import { sendToAirtable, verifyAirtableSetup } from './utils/airtable.js';
import { parseEventDate } from './utils/date-parser.js';

await Actor.main(async () => {
  const input = await Actor.getInput() ?? {};
  
  // Environment setup
  const hasAirtableToken = !!process.env.AIRTABLE_TOKEN;
  const hasAirtableBase = !!process.env.AIRTABLE_BASE_ID;
  
  log.info('🚀 Starting Local Loop Multi-Town Event Scraper');
  log.info(`🏘️ Architecture: Modular (ready for expansion)`);
  log.info(`🐛 Debug mode: ${input.debug ? 'ON' : 'OFF'}`);
  log.info(`📊 Airtable integration: ${hasAirtableToken && hasAirtableBase ? 'ENABLED' : 'DISABLED'}`);
  
  // Verify Airtable setup
  let airtableReady = false;
  if (hasAirtableToken && hasAirtableBase) {
    airtableReady = await verifyAirtableSetup(process.env.AIRTABLE_TOKEN, process.env.AIRTABLE_BASE_ID);
  }

  // Initialize browser using Crawlee's launchPuppeteer (part of Apify SDK)
  log.info('🌐 Launching browser with Crawlee...');
  
  const browser = await launchPuppeteer({
    launchOptions: {
      headless: !input.debug,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-gpu',
        '--no-first-run'
      ]
    }
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  let allEvents = [];
  const scrapingResults = {};
  
  try {
    // Configure towns to scrape (easily expandable!)
    const towns = [
      {
        name: 'West Islip',
        scraper: scrapeWestIslip,
        enabled: true
      }
    ];
    
    // Scrape each enabled town
    for (const [index, town] of towns.entries()) {
      if (!town.enabled) {
        log.info(`⭐️ Skipping ${town.name} (disabled)`);
        continue;
      }
      
      try {
        log.info(`\n🏘️ Scraping ${town.name} (${index + 1}/${towns.filter(t => t.enabled).length})`);
        
        const townEvents = await town.scraper(page);
        allEvents = allEvents.concat(townEvents);
        
        scrapingResults[town.name] = { 
          success: true, 
          count: townEvents.length,
          sources: getTownSourceBreakdown(townEvents)
        };
        
        log.info(`✅ ${town.name}: ${townEvents.length} total events collected`);
        
        // Respectful delay between towns
        if (index < towns.filter(t => t.enabled).length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
      } catch (townError) {
        log.error(`❌ Error scraping ${town.name}: ${townError.message}`);
        scrapingResults[town.name] = { success: false, error: townError.message };
      }
    }
    
    // Process and display results
    await processResults(allEvents, scrapingResults, airtableReady);
    
  } catch (error) {
    await handleCriticalError(error, allEvents, scrapingResults);
  } finally {
    await browser.close();
    log.info('📚 Browser closed - scraping complete');
  }
});

// Helper function to get source breakdown for a town
function getTownSourceBreakdown(events) {
  return events.reduce((acc, event) => {
    acc[event.source] = (acc[event.source] || 0) + 1;
    return acc;
  }, {});
}

// Process and display all results
async function processResults(allEvents, scrapingResults, airtableReady) {
  // Results summary
  log.info(`\n📊 SCRAPING SUMMARY`);
  log.info(`📈 Total events found: ${allEvents.length}`);
  
  Object.entries(scrapingResults).forEach(([town, result]) => {
    const status = result.success ? '✅' : '❌';
    if (result.success) {
      log.info(`${status} ${town}: ${result.count} events`);
      if (result.sources) {
        Object.entries(result.sources).forEach(([source, count]) => {
          log.info(`    🔍 ${source}: ${count} events`);
        });
      }
    } else {
      log.info(`${status} ${town}: Error - ${result.error}`);
    }
  });
  
  if (allEvents.length === 0) {
    log.warning('⚠️ No events found to process');
    return;
  }
  
  // Sort events chronologically
  log.info('\n📅 Sorting events chronologically...');
  allEvents.sort((a, b) => {
    const dateA = parseEventDate(a.start_raw);
    const dateB = parseEventDate(b.start_raw);
    return dateA.getTime() - dateB.getTime();
  });
  
  // Show sample upcoming events
  log.info('\n🎪 Upcoming events (sample):');
  allEvents.slice(0, 8).forEach((event, i) => {
    const eventDate = parseEventDate(event.start_raw);
    const dateStr = eventDate.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      hour: eventDate.getHours() ? 'numeric' : undefined,
      minute: eventDate.getMinutes() ? 'numeric' : undefined
    });
    log.info(`${String(i + 1).padStart(2)}. ${dateStr} - ${event.title_raw}`);
    log.info(`    🏟️ ${event.location_raw} (${event.source})`);
  });
  
  // Save to Apify dataset
  await Actor.pushData(allEvents);
  log.info(`💾 Saved ${allEvents.length} events to Apify dataset`);
  
  // Airtable integration
  if (airtableReady) {
    log.info('\n📄 Sending events to Airtable...');
    const airtableResult = await sendToAirtable(allEvents);
    log.info(`📊 Airtable result: ${airtableResult.sent} sent, ${airtableResult.skipped} skipped`);
  } else {
    log.warning('⚠️ Skipping Airtable integration - setup verification failed');
  }
  
  // Store run statistics
  await Actor.setValue('LATEST_SCRAPE', {
    scraped_at: new Date().toISOString(),
    total_events_found: allEvents.length,
    scraping_results: scrapingResults,
    events_by_source: getTownSourceBreakdown(allEvents),
    airtable_integration: airtableReady,
    success: true,
    architecture: 'modular',
    towns_scraped: Object.keys(scrapingResults)
  });
  
  // Success message
  log.info('\n🎉 SCRAPING COMPLETED SUCCESSFULLY!');
  log.info(`📈 Collected ${allEvents.length} events from ${Object.keys(scrapingResults).length} towns`);
  if (airtableReady) {
    log.info('💫 Airtable integration completed');
  }
}

// Handle critical errors gracefully
async function handleCriticalError(error, allEvents, scrapingResults) {
  log.error('💥 Critical scraping error:', error.message);
  log.error('Stack trace:', error.stack);
  
  // Save partial results if any
  if (allEvents.length > 0) {
    await Actor.pushData(allEvents);
    log.info(`💾 Saved ${allEvents.length} partial results to dataset`);
  }
  
  // Store error details
  await Actor.setValue('LATEST_ERROR', {
    error_at: new Date().toISOString(),
    error_message: error.message,
    error_stack: error.stack,
    events_collected: allEvents.length,
    scraping_results: scrapingResults
  });
}
