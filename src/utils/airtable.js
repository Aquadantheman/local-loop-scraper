// src/utils/airtable.js - Airtable integration utilities for Local Loop
import { log } from 'apify';

export async function verifyAirtableSetup(AIRTABLE_TOKEN, AIRTABLE_BASE_ID) {
  try {
    log.info('🔍 Verifying Airtable setup...');
    
    const eventsResponse = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/RawEvents?maxRecords=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!eventsResponse.ok) {
      throw new Error(`RawEvents table access failed: ${eventsResponse.status}`);
    }
    
    log.info('✅ Airtable connection verified successfully');
    return true;
    
  } catch (error) {
    log.error('❌ Airtable setup verification failed:', error.message);
    log.error('Please check:');
    log.error('1. AIRTABLE_TOKEN is valid and has write permissions');
    log.error('2. AIRTABLE_BASE_ID is correct'); 
    log.error('3. Table "RawEvents" exists with proper field names');
    return false;
  }
}

async function clearAllEvents(AIRTABLE_TOKEN, AIRTABLE_BASE_ID) {
  try {
    log.info('Clearing all existing events from Airtable for fresh start...');
    
    let allRecords = [];
    let offset = null;
    
    do {
      let url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/RawEvents`;
      if (offset) {
        url += `?offset=${offset}`;
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        log.warning(`Could not fetch records for clearing: ${response.status}`);
        return;
      }

      const result = await response.json();
      allRecords = allRecords.concat(result.records);
      offset = result.offset;
      
      log.info(`Fetched ${result.records.length} records, total so far: ${allRecords.length}`);
      
    } while (offset);

    if (allRecords.length === 0) {
      log.info('No existing records to clear');
      return;
    }
    
    log.info(`Found ${allRecords.length} total existing records to delete`);
    
    const batchSize = 10;
    let totalDeleted = 0;
    
    for (let i = 0; i < allRecords.length; i += batchSize) {
      const batch = allRecords.slice(i, i + batchSize);
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
        log.info(`Cleared batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allRecords.length/batchSize)} (${deleteResult.records.length} records)`);
      } else {
        const errorText = await deleteResponse.text();
        log.error(`Failed to clear batch ${Math.floor(i/batchSize) + 1}: ${deleteResponse.status} - ${errorText}`);
      }
      
      if (i + batchSize < allRecords.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    log.info(`Successfully cleared ${totalDeleted} records from Airtable`);
    
  } catch (error) {
    log.warning('Error during clearing (continuing anyway):', error.message);
  }
}

export async function sendToAirtable(events) {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    log.warning('Airtable credentials not provided. Required environment variables:');
    log.warning('- AIRTABLE_TOKEN');  
    log.warning('- AIRTABLE_BASE_ID');
    return;
  }

  try {
    log.info(`Starting Airtable integration for ${events.length} events`);
    
    await clearAllEvents(AIRTABLE_TOKEN, AIRTABLE_BASE_ID);
    
    if (events.length === 0) {
      log.info('No events to send to Airtable');
      return;
    }
    
    const batchSize = 10;
    let totalSent = 0;
    
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      
      const records = batch.map(event => ({
        fields: {
          source_name: event.source || 'Unknown Source',
          title_raw: event.title_raw || '',
          description_raw: event.description_raw || '',
          start_raw: event.start_raw || '',
          location_raw: event.location_raw || '',
          url_raw: event.url_raw || '',
          category_hint: event.category_hint || '',
          fetched_at: event.fetched_at || new Date().toISOString(),
          hash: event.hash || ''
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

      if (!response.ok) {
        const errorText = await response.text();
        log.error(`Airtable API error for batch ${Math.floor(i/batchSize) + 1}: ${response.status} - ${errorText}`);
        continue;
      }

      const result = await response.json();
      totalSent += result.records.length;
      log.info(`Successfully sent batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(events.length/batchSize)} to Airtable (${result.records.length} records)`);
      
      if (i + batchSize < events.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    log.info(`✅ Airtable integration complete!`);
    log.info(`📊 Total events sent: ${totalSent}`);
    
    // Log source breakdown
    const eventsBySource = {};
    events.forEach(event => {
      eventsBySource[event.source] = (eventsBySource[event.source] || 0) + 1;
    });
    
    log.info('📈 Events by source:');
    Object.entries(eventsBySource).forEach(([source, count]) => {
      log.info(`   ✅ ${source}: ${count} events`);
    });
    
  } catch (error) {
    log.error('Failed to send events to Airtable:', error.message);
  }
}
