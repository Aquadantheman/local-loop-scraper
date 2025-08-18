// src/utils/airtable.js - Simple connection test version
import { log } from 'apify';

export async function verifyAirtableSetup(AIRTABLE_TOKEN, AIRTABLE_BASE_ID) {
  try {
    log.info('🔍 Testing Airtable connection...');
    
    // Simple connection test first
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
      
      if (response.status === 403) {
        log.error('🔑 This is a permissions issue. Please check:');
        log.error('1. Your AIRTABLE_TOKEN has read/write permissions');
        log.error('2. The token has access to this specific base');
        log.error('3. You are using a Personal Access Token (not API key)');
      } else if (response.status === 404) {
        log.error('🗃️ Table or base not found. Please check:');
        log.error('1. AIRTABLE_BASE_ID is correct (starts with "app")');
        log.error('2. Table "RawEvents" exists in your base');
      } else if (response.status === 401) {
        log.error('🚫 Authentication failed. Please check:');
        log.error('1. AIRTABLE_TOKEN is valid and not expired');
      }
      
      return false;
    }
    
    log.info('✅ Airtable connection successful!');
    return true;
    
  } catch (error) {
    log.error('❌ Airtable connection failed:', error.message);
    return false;
  }
}

export async function sendToAirtable(events) {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    log.warning('⚠️ Airtable credentials missing');
    return { sent: 0, skipped: events.length, error: 'Missing credentials' };
  }

  log.info(`📤 Attempting to send ${events.length} events to Airtable`);
  
  try {
    // First, clear existing events (optional)
    log.info('🧹 Clearing existing events...');
    
    // Get existing records
    const getResponse = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/RawEvents`, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (getResponse.ok) {
      const existingData = await getResponse.json();
      if (existingData.records && existingData.records.length > 0) {
        log.info(`🗑️ Found ${existingData.records.length} existing records to clear`);
        
        // Delete in batches of 10
        const deletePromises = [];
        for (let i = 0; i < existingData.records.length; i += 10) {
          const batch = existingData.records.slice(i, i + 10);
          const recordIds = batch.map(r => r.id);
          
          const deleteUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/RawEvents?${recordIds.map(id => `records[]=${id}`).join('&')}`;
          
          deletePromises.push(
            fetch(deleteUrl, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
                'Content-Type': 'application/json'
              }
            })
          );
        }
        
        await Promise.all(deletePromises);
        log.info('✅ Cleared existing records');
      }
    }
    
    // Now add new events
    const validEvents = events.filter(event => event.title_raw && event.title_raw.trim());
    let totalSent = 0;
    
    // Send in batches of 10
    for (let i = 0; i < validEvents.length; i += 10) {
      const batch = validEvents.slice(i, i + 10);
      
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
        log.info(`📤 Sent batch ${Math.floor(i/10) + 1}: ${result.records.length} records`);
      } else {
        const errorText = await response.text();
        log.error(`❌ Batch ${Math.floor(i/10) + 1} failed: ${response.status} - ${errorText}`);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    log.info(`✅ Successfully sent ${totalSent} events to Airtable`);
    
    return { 
      sent: totalSent, 
      skipped: events.length - validEvents.length, 
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
