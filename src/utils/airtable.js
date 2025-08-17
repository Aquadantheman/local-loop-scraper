// src/utils/airtable.js - Enhanced Airtable integration for Local Loop
import { log } from 'apify';

export async function verifyAirtableSetup(AIRTABLE_TOKEN, AIRTABLE_BASE_ID) {
  try {
    log.info('🔍 Verifying Airtable setup...');
    
    // Test connection and get base info
    const baseResponse = await fetchWithRetry(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!baseResponse.ok) {
      throw new Error(`Base access failed: ${baseResponse.status} ${baseResponse.statusText}`);
    }
    
    const baseData = await baseResponse.json();
    
    // Check if RawEvents table exists
    const rawEventsTable = baseData.tables.find(table => table.name === 'RawEvents');
    if (!rawEventsTable) {
      throw new Error('RawEvents table not found in base');
    }
    
    // Verify required fields exist
    const requiredFields = [
      'source_name', 'title_raw', 'description_raw', 'start_raw', 
      'location_raw', 'url_raw', 'category_hint', 'fetched_at', 'hash'
    ];
    
    const tableFields = rawEventsTable.fields.map(field => field.name);
    const missingFields = requiredFields.filter(field => !tableFields.includes(field));
    
    if (missingFields.length > 0) {
      log.warning(`⚠️ Missing fields in RawEvents table: ${missingFields.join(', ')}`);
      log.info('📝 Available fields:', tableFields.join(', '));
    }
    
    // Test write permission with a small test
    const testResponse = await fetchWithRetry(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/RawEvents?maxRecords=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!testResponse.ok) {
      throw new Error(`Read permission test failed: ${testResponse.status}`);
    }
    
    log.info('✅ Airtable connection verified successfully');
    log.info(`📊 Base: ${baseData.tables.length} tables, RawEvents has ${tableFields.length} fields`);
    
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

// Enhanced fetch with retry logic and rate limiting
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Handle rate limiting (429)
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '30');
        log.warning(`🔄 Rate limited, waiting ${retryAfter}s before retry ${attempt}/${maxRetries}`);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
      }
      
      // Handle server errors (5xx)
      if (response.status >= 500 && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff
        log.warning(`🔄 Server error ${response.status}, retrying in ${delay}ms (${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return response;
      
    } catch (error) {
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        log.warning(`🔄 Network error, retrying in ${delay}ms (${attempt}/${maxRetries}): ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

// Improved clearing function with progress tracking
async function clearAllEvents(AIRTABLE_TOKEN, AIRTABLE_BASE_ID) {
  try {
    log.info('🧹 Clearing existing events from Airtable...');
    
    let allRecords = [];
    let offset = null;
    let totalFetched = 0;
    
    // Fetch all records in batches
    do {
      let url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/RawEvents`;
      if (offset) {
        url += `?offset=${offset}`;
      }
      
      const response = await fetchWithRetry(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          log.info('📝 Table is empty or doesn\'t exist yet');
          return { cleared: 0 };
        }
        throw new Error(`Failed to fetch records: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      allRecords = allRecords.concat(result.records);
      totalFetched += result.records.length;
      offset = result.offset;
      
      if (totalFetched > 0) {
        log.info(`📥 Fetched ${totalFetched} existing records...`);
      }
      
    } while (offset);

    if (allRecords.length === 0) {
      log.info('✨ No existing records to clear');
      return { cleared: 0 };
    }
    
    log.info(`🗑️ Found ${allRecords.length} records to delete`);
    
    // Delete in batches of 10 (Airtable limit)
    const batchSize = 10;
    let totalDeleted = 0;
    const totalBatches = Math.ceil(allRecords.length / batchSize);
    
    for (let i = 0; i < allRecords.length; i += batchSize) {
      const batch = allRecords.slice(i, i + batchSize);
      const recordIds = batch.map(record => record.id);
      const currentBatch = Math.floor(i / batchSize) + 1;
      
      const deleteUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/RawEvents?${recordIds.map(id => `records[]=${id}`).join('&')}`;
      
      const deleteResponse = await fetchWithRetry(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (deleteResponse.ok) {
        const deleteResult = await deleteResponse.json();
        totalDeleted += deleteResult.records.length;
        log.info(`🗑️ Cleared batch ${currentBatch}/${totalBatches} (${deleteResult.records.length} records)`);
      } else {
        const errorText = await deleteResponse.text();
        log.error(`❌ Failed to clear batch ${currentBatch}: ${deleteResponse.status} - ${errorText}`);
      }
      
      // Rate limiting: wait between batches
      if (i + batchSize < allRecords.length) {
        await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
      }
    }
    
    log.info(`🧹 Successfully cleared ${totalDeleted}/${allRecords.length} records`);
    return { cleared: totalDeleted, attempted: allRecords.length };
    
  } catch (error) {
    log.warning('⚠️ Error during clearing (continuing anyway):', error.message);
    return { cleared: 0, error: error.message };
  }
}

// Enhanced send function with better error handling and progress tracking
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
    const startTime = Date.now();
    
    // Clear existing events first
    const clearResult = await clearAllEvents(AIRTABLE_TOKEN, AIRTABLE_BASE_ID);
    
    if (events.length === 0) {
      log.info('📝 No events to send to Airtable');
      return { sent: 0, skipped: 0, cleared: clearResult.cleared };
    }
    
    // Validate and prepare events
    const validEvents = events.filter(event => {
      if (!event.title_raw || event.title_raw.trim().length === 0) {
        log.warning(`⚠️ Skipping event with empty title: ${JSON.stringify(event).substring(0, 100)}`);
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
      
      // Prepare records with proper field mapping
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
        const response = await fetchWithRetry(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/RawEvents`, {
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
          await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
        }
        
      } catch (batchError) {
        log.error(`❌ Error processing batch ${currentBatch}: ${batchError.message}`);
        totalErrors++;
      }
    }
    
    const processingTime = Math.round((Date.now() - startTime) / 1000);
    
    log.info(`✅ Airtable integration complete!`);
    log.info(`📊 Results: ${totalSent} sent, ${totalErrors} batch errors, ${processingTime}s processing time`);
    
    // Log source breakdown for verification
    const eventsBySource = validEvents.reduce((acc, event) => {
      acc[event.source] = (acc[event.source] || 0) + 1;
      return acc;
    }, {});
    
    log.info('📈 Events by source:');
    Object.entries(eventsBySource).forEach(([source, count]) => {
      log.info(`   ✅ ${source}: ${count} events`);
    });
    
    return { 
      sent: totalSent, 
      skipped: events.length - validEvents.length, 
      errors: totalErrors,
      cleared: clearResult.cleared,
      processingTimeSeconds: processingTime
    };
    
  } catch (error) {
    log.error('❌ Failed to send events to Airtable:', error.message);
    return { 
      sent: 0, 
      skipped: events.length, 
      error: error.message 
    };
  }
}
