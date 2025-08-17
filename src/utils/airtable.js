// src/utils/airtable.js - Improved error handling
import { log } from 'apify';

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
      // Handle specific error codes with better messages
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
    
    // Check if RawEvents table exists
    const rawEventsTable = baseData.tables.find(table => table.name === 'RawEvents');
    if (!rawEventsTable) {
      throw new Error('RawEvents table not found in base');
    }
    
    log.info('✅ Airtable connection verified successfully');
    log.info(`📊 Base has ${baseData.tables.length} tables, found RawEvents table`);
    
    return true;
    
  } catch (error) {
    // Clean error logging
    let errorMessage = error.message;
    if (typeof error.message === 'object') {
      errorMessage = JSON.stringify(error.message);
    }
    
    log.error('❌ Airtable setup verification failed:', errorMessage);
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
    const error = 'Airtable credentials not provided. Required: AIRTABLE_TOKEN, AIRTABLE_BASE_ID';
    log.warning('⚠️ ' + error);
    return { sent: 0, skipped: events.length, error };
  }

  try {
    log.info(`📤 Starting Airtable integration for ${events.length} events`);
    
    if (events.length === 0) {
      log.info('📝 No events to send to Airtable');
      return { sent: 0, skipped: 0 };
    }
    
    // Filter out events with missing required fields
    const validEvents = events.filter(event => {
      if (!event.title_raw || event.title_raw.trim().length === 0) {
        log.warning(`⚠️ Skipping event with empty title`);
        return false;
      }
      return true;
    });
    
    if (validEvents.length !== events.length) {
      log.warning(`⚠️ Filtered out ${events.length - validEvents.length} invalid events`);
    }
    
    const batchSize = 10; // Airtable limit
    let totalSent = 0;
    let totalErrors = 0;
    const totalBatches = Math.ceil(validEvents.length / batchSize);
    
    log.info(`📦 Sending ${validEvents.length} events in ${totalBatches} batches`);
    
    for (let i = 0; i < validEvents.length; i += batchSize) {
      const batch = validEvents.slice(i, i + batchSize);
      const currentBatch = Math.floor(i / batchSize) + 1;
      
      // Prepare records with proper field mapping and length limits
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
          log.error(`❌ Airtable API error for batch ${currentBatch}: ${response.status} - ${errorText}`);
          totalErrors++;
          continue;
        }

        const result = await response.json();
        totalSent += result.records.length;
        
        const percentage = Math.round((currentBatch / totalBatches) * 100);
        log.info(`📤 Sent batch ${currentBatch}/${totalBatches} (${percentage}%) - ${result.records.length} records`);
        
        // Rate limiting: wait between batches
        if (i + batchSize < validEvents.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
      } catch (batchError) {
        log.error(`❌ Error processing batch ${currentBatch}: ${batchError.message}`);
        totalErrors++;
      }
    }
    
    log.info(`✅ Airtable integration complete!`);
    log.info(`📊 Results: ${totalSent} sent, ${totalErrors} batch errors`);
    
    return { 
      sent: totalSent, 
      skipped: events.length - validEvents.length, 
      errors: totalErrors
    };
    
  } catch (error) {
    let errorMessage = error.message;
    if (typeof error.message === 'object') {
      errorMessage = JSON.stringify(error.message);
    }
    
    log.error('❌ Failed to send events to Airtable:', errorMessage);
    return { 
      sent: 0, 
      skipped: events.length, 
      error: errorMessage 
    };
  }
}
