// src/main.js - Local Loop Event Scraper (Minimal Dependencies)
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
  
  log.info('🚀 Starting Local Loop Event Scraper (Fast Build)');
  log.info(`🛠 Debug: ${config.debug}, Max events: ${config.maxEvents}`);
  log.info(`📋 Airtable: ${hasAirtableToken && hasAirtableBase ? 'ENABLED' : 'DISABLED'}`);
  
  // Verify Airtable setup early
  let airtableReady = false;
  if (hasAirtableToken && hasAirtableBase) {
    airtableReady = await verifyAirtableSetup(process.env.AIRTABLE_TOKEN, process.env.AIRTABLE_BASE_ID);
  }

  let browser;
  try {
    log.info('🌐 Launching browser...');
    
    // Use built-in Puppeteer from base image
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
    
    // Block resources for faster loading
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
          scrapingTimeSeconds: scrapingTime
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
    }
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      log.info('📚 Browser closed');
    }
  }
});

async function processResults(allEvents, scrapingResults, airtableReady, config) {
  log.info(`\n📊 RESULTS: ${allEvents.length} total events`);
  
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
  
  // Filter future events
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
  log.info('\n🎪 Sample events:');
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
  
  // Store results
  await Actor.setValue('LATEST_SCRAPE', {
    scraped_at: new Date().toISOString(),
    total_events: processedEvents.length,
    success: true
  });
  
  log.info(`\n🎉 COMPLETED: ${processedEvents.length} events processed`);
}

function isEventInFuture(dateString) {
  if (!dateString) return true;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDate = parseEventDate(dateString);
  return eventDate >= today;
}
