// src/utils/airtable.js - Clean error messages
import { log } from 'apify';

function cleanErrorMessage(error) {
  // Handle the weird character array error format
  if (typeof error === 'object' && error !== null && !error.message) {
    // Convert character array back to string
    if (Array.isArray(Object.values(error))) {
      return Object.values(error).join('');
    }
    return JSON.stringify(error);
  }
  
  if (error.message) {
    return error.message;
  }
  
  return String(error);
}

export async function verifyAirtableSetup(AIRTABLE_TOKEN, AIRTABLE_BASE_ID) {
  try {
    log.info('🔍 Verifying Airtable setup...');
    
    const response = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Access forbidden - check your Airtable token permissions');
      } else if (response.status === 404) {
        throw new Error('Base not found - check your AIRTABLE_BASE_ID');
      } else if (response.status === 401) {
        throw new Error('Authentication failed - check your AIRTABLE_TOKEN');
      } else {
        throw new Error(`Airtable API error: ${response.status} ${response.statusText}`);
      }
    }
    
    const baseData = await response.json();
    const rawEventsTable = baseData.tables.find(table => table.name === 'RawEvents');
    
    if (!rawEventsTable) {
      throw new Error('RawEvents table not found in base');
    }
    
    log.info('✅ Airtable connection verified successfully');
    return true;
    
  } catch (error) {
    const cleanMessage = cleanErrorMessage(error);
    log.error('❌ Airtable setup verification failed:', cleanMessage);
    log.error('Please check:');
    log.error('1. AIRTABLE_TOKEN is valid and has write permissions');
    log.error('2. AIRTABLE_BASE_ID is correct'); 
    log.error('3. Table "RawEvents" exists with proper field names');
    return false;
  }
}

export async function sendToAirtable(events) {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    log.warning('⚠️ Airtable credentials not provided');
    return { sent: 0, skipped: events.length, error: 'Missing credentials' };
  }

  try {
    log.info(`📤 Starting Airtable integration for ${events.length} events`);
    
    if (events.length === 0) {
      return { sent: 0, skipped: 0 };
    }
    
    const validEvents = events.filter(event => {
      if (!event.title_raw || event.title_raw.trim().length === 0) {
        log.warning(`⚠️ Skipping event with empty title`);
        return false;
      }
      return true;
    });
    
    const batchSize = 10;
    let totalSent = 0;
    let totalErrors = 0;
    const totalBatches = Math.ceil(validEvents.length / batchSize);
    
    for (let i = 0; i < validEvents.length; i += batchSize) {
      const batch = validEvents.slice(i, i + batchSize);
      const currentBatch = Math.floor(i / batchSize) + 1;
      
      const records = batch.map(event => ({
        fields: {
          source_name: String(event.source || 'Unknown Source').substring(0, 255),
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

      try {
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
          log.error(`❌ Airtable batch ${currentBatch} failed: ${response.status} - ${errorText}`);
          totalErrors++;
          continue;
        }

        const result = await response.json();
        totalSent += result.records.length;
        log.info(`📤 Sent batch ${currentBatch}/${totalBatches} - ${result.records.length} records`);
        
        if (i + batchSize < validEvents.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
      } catch (batchError) {
        const cleanMessage = cleanErrorMessage(batchError);
        log.error(`❌ Batch ${currentBatch} error: ${cleanMessage}`);
        totalErrors++;
      }
    }
    
    log.info(`✅ Airtable integration complete: ${totalSent} sent, ${totalErrors} errors`);
    
    return { 
      sent: totalSent, 
      skipped: events.length - validEvents.length, 
      errors: totalErrors
    };
    
  } catch (error) {
    const cleanMessage = cleanErrorMessage(error);
    log.error('❌ Airtable integration failed:', cleanMessage);
    return { 
      sent: 0, 
      skipped: events.length, 
      error: cleanMessage 
    };
  }
}
