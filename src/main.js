// src/main.js - Quick Test Version (Library Only)
import { Actor, log } from 'apify';
import puppeteer from 'puppeteer';
import { scrapeLibrary } from './towns/west-islip/sources/library.js';
import { parseEventDate } from './utils/date-parser.js';

await Actor.main(async () => {
  const input = await Actor.getInput() ?? {};
  
  log.info('🚀 Quick Test - Library Only');
  log.info(`🛠 Debug: ${input.debug || false}`);
  
  // Skip Airtable for now to focus on scraping
  log.info('📋 Airtable: SKIPPED for testing');

  let browser;
  try {
    log.info('🌐 Launching browser...');
    
    browser = await puppeteer.launch({
      headless: !(input.debug || false),
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
    
    // Don't block resources for initial test
    log.info('🎯 Testing West Islip Library scraper...');
    
    const startTime = Date.now();
    const libraryEvents = await scrapeLibrary(page);
    const scrapingTime = Math.round((Date.now() - startTime) / 1000);
    
    log.info(`✅ Library test completed in ${scrapingTime}s`);
    log.info(`📊 Found ${libraryEvents.length} events`);
    
    if (libraryEvents.length > 0) {
      log.info('\n🎪 Sample events found:');
      libraryEvents.slice(0, 3).forEach((event, i) => {
        log.info(`${i + 1}. "${event.title_raw}"`);
        log.info(`   📅 ${event.start_raw}`);
        log.info(`   📝 ${event.description_raw.substring(0, 100)}...`);
      });
      
      // Sort chronologically
      libraryEvents.sort((a, b) => {
        const dateA = parseEventDate(a.start_raw);
        const dateB = parseEventDate(b.start_raw);
        return dateA.getTime() - dateB.getTime();
      });
      
      // Save to dataset
      await Actor.pushData(libraryEvents);
      log.info(`💾 Saved ${libraryEvents.length} events to dataset`);
      
      // Store results
      await Actor.setValue('LATEST_TEST', {
        scraped_at: new Date().toISOString(),
        total_events: libraryEvents.length,
        source: 'West Islip Public Library',
        scraping_time_seconds: scrapingTime,
        success: true
      });
      
      log.info(`\n🎉 TEST SUCCESSFUL: ${libraryEvents.length} events found!`);
    } else {
      log.warning('⚠️ No events found - need to debug scraper');
      
      // Let's see what's on the page
      const pageTitle = await page.title();
      const pageUrl = await page.url();
      
      log.info(`📄 Page title: "${pageTitle}"`);
      log.info(`🔗 Page URL: ${pageUrl}`);
      
      // Check if page loaded correctly
      const hasContent = await page.evaluate(() => {
        return {
          bodyText: document.body ? document.body.textContent.substring(0, 200) : 'No body',
          hasEvents: !!document.querySelector('.eelistevent'),
          elementCount: document.querySelectorAll('*').length
        };
      });
      
      log.info(`📊 Page info:`, hasContent);
      
      await Actor.setValue('LATEST_TEST', {
        scraped_at: new Date().toISOString(),
        total_events: 0,
        error: 'No events found',
        page_info: hasContent,
        scraping_time_seconds: scrapingTime,
        success: false
      });
    }
    
  } catch (error) {
    log.error('💥 Test failed:', error.message);
    
    await Actor.setValue('LATEST_ERROR', {
      error_at: new Date().toISOString(),
      error_message: error.message,
      test_type: 'library_only'
    });
    
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      log.info('📚 Browser closed');
    }
  }
});
