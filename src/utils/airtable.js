// src/utils/airtable.js - Fixed clearing logic
import { log } from 'apify';

export async function verifyAirtableSetup(AIRTABLE_TOKEN, AIRTABLE_BASE_ID) {
  try {
    log.info('🔍 Testing Airtable connection...');
    
    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/RawEvents?maxRecords=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    log.info(`📡 Airtable response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      log.error(`❌ Airtable error: ${response.status} - ${errorText}`);
      return false;
    }
    
    log.info('✅ Airtable connection successful!');
    return true;
    
  } catch (error) {
    log.error('❌ Airtable connection failed:', error.message);
    return false;
  }
}

async function clearAllRecords(AIRTABLE_TOKEN, AIRTABLE_BASE_ID) {
  try {
    log.info('🧹 Clearing all existing records...');
    
    let allRecords = [];
    let offset = null;
    
    // Fetch ALL records first
    do {
      let url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/RawEvents`;
      if (offset) {
        url += `?offset=${offset}`;
      }
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          log.info('📝 Table is empty, nothing to clear');
          return 0;
        }
        throw new Error(`Failed to fetch records: ${response.status}`);
      }
      
      const result = await response.json();
      allRecords = allRecords.concat(result.records);
      offset = result.offset;
      
      log.info(`📥 Fetched ${result.records.length} records (total: ${allRecords.length})`);
      
    } while (offset);
    
    if (allRecords.length === 0) {
      log.info('✨ No records to clear');
      return 0;
    }
    
    log.info(`🗑️ Found ${allRecords.length} total records to delete`);
    
    // Delete in batches of 10 (Airtable limit)
    let totalDeleted = 0;
    for (let i = 0; i < allRecords.length; i += 10) {
      const batch = allRecords.slice(i, i + 10);
      const recordIds = batch.map(record => record.id);
      
      const deleteUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/RawEvents?${recordIds.map(id => `records[]=${id}`).join('&')}`;
      
      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (deleteResponse.ok) {
        const deleteResult = await deleteResponse.json();
        totalDeleted += deleteResult.records.length;
        log.info(`🗑️ Deleted batch ${Math.floor(i/10) + 1}/${Math.ceil(allRecords.length/10)} (${deleteResult.records.length} records)`);
      } else {
        const errorText = await deleteResponse.text();
        log.error(`❌ Failed to delete batch: ${deleteResponse.status} - ${errorText}`);
      }
      
      // Rate limiting between batches
      if (i + 10 < allRecords.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    log.info(`✅ Successfully deleted ${totalDeleted} records`);
    return totalDeleted;
    
  } catch (error) {
    log.error('❌ Error clearing records:', error.message);
    throw error;
  }
}

export async function sendToAirtable(events) {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    log.warning('⚠️ Airtable credentials missing');
    return { sent: 0, skipped: events.length, error: 'Missing credentials' };
  }

  log.info(`📤 Starting Airtable integration for ${events.length} events`);
  
  try {
    // FIRST: Clear ALL existing records
    const deletedCount = await clearAllRecords(AIRTABLE_TOKEN, AIRTABLE_BASE_ID);
    
    if (events.length === 0) {
      log.info('📝 No new events to add');
      return { sent: 0, skipped: 0, cleared: deletedCount };
    }
    
    // Filter valid events
    const validEvents = events.filter(event => {
      if (!event.title_raw || event.title_raw.trim().length === 0) {
        log.warning(`⚠️ Skipping event with empty title`);
        return false;
      }
      return true;
    });
    
    log.info(`📤 Adding ${validEvents.length} new events to clean table`);
    
    let totalSent = 0;
    const batchSize = 10;
    const totalBatches = Math.ceil(validEvents.length / batchSize);
    
    // Add new events in batches
    for (let i = 0; i < validEvents.length; i += batchSize) {
      const batch = validEvents.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      
      const records = batch.map(event => ({
        fields: {
          source_name: String(event.source || '').substring(0, 255),
          title_raw: String(event.title_raw || '').substring(0, 1000),
          description_raw: String(event.description_raw || '').substring(0, 2000),
          start_raw: String(event.start_raw || '').substring(0, 255),
          location_raw: String(event.location_raw || '').substring(0, 500),
          url_raw: String(event.url_raw || '').substring(0, 1000),
          category_hint: String(event.category_hint || '').substring(0, 255),
          fetched_at: event.fetched_at || new Date().toISOString(),
          hash: String(event.hash || '').substring(0, 255)
        }
      }));

      const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/RawEvents`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ records })
      });

      if (response.ok) {
        const result = await response.json();
        totalSent += result.records.length;
        log.info(`📤 Added batch ${batchNumber}/${totalBatches}: ${result.records.length} records`);
      } else {
        const errorText = await response.text();
        log.error(`❌ Batch ${batchNumber} failed: ${response.status} - ${errorText}`);
      }
      
      // Rate limiting between batches
      if (i + batchSize < validEvents.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    log.info(`✅ Airtable update complete: Cleared ${deletedCount}, Added ${totalSent}`);
    
    return { 
      sent: totalSent, 
      skipped: events.length - validEvents.length,
      cleared: deletedCount,
      errors: 0
    };
    
  } catch (error) {
    log.error('❌ Airtable integration failed:', error.message);
    return { 
      sent: 0, 
      skipped: events.length, 
      error: error.message 
    };
  }
}
