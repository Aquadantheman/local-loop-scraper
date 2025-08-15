// src/towns/west-islip/index.js - West Islip town coordinator
import { log } from 'apify';
import { scrapeLibrary } from './sources/library.js';
import { scrapeChamber } from './sources/chamber.js';
import { scrapeCountryFair } from './sources/country-fair.js';
import { scrapeHistoricalSociety } from './sources/historical.js';
import { scrapeFireDepartment } from './sources/fire-dept.js';

export async function scrapeWestIslip(page) {
  log.info('=== SCRAPING TOWN: West Islip ===');
  
  let allEvents = [];
  
  // Configure West Islip sources
  const sources = [
    { name: 'Library', fn: scrapeLibrary, enabled: true },
    { name: 'Chamber', fn: scrapeChamber, enabled: true },
    { name: 'Country Fair', fn: scrapeCountryFair, enabled: true }, 
    { name: 'Historical Society', fn: scrapeHistoricalSociety, enabled: true },
    { name: 'Fire Department', fn: scrapeFireDepartment, enabled: true }
  ];
  
  for (const [index, source] of sources.entries()) {
    if (!source.enabled) {
      log.info(`⏭️  Skipping ${source.name} (disabled)`);
      continue;
    }
    
    try {
      log.info(`\n🎯 Scraping ${source.name} (${index + 1}/${sources.length})`);
      
      const events = await source.fn(page);
      allEvents = allEvents.concat(events);
      
      log.info(`✅ ${source.name}: ${events.length} events collected`);
      
      // Delay between sources to be respectful
      if (index < sources.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
    } catch (sourceError) {
      log.error(`❌ Error scraping ${source.name}: ${sourceError.message}`);
      // Continue with other sources even if one fails
    }
  }
  
  log.info(`🏘️  West Islip total: ${allEvents.length} events from ${sources.filter(s => s.enabled).length} sources`);
  
  return allEvents;
}
