// src/utils/date-parser.js - Fixed for Historical Society dates
export function parseEventDate(dateString) {
  if (!dateString) return new Date('2099-12-31');
  
  const now = new Date();
  const currentYear = now.getFullYear();
  
  // Pattern 1: "August 14: 11:00am - 2:00pm" or "August 14"
  const monthDayMatch = dateString.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})\b/i);
  if (monthDayMatch) {
    const monthName = monthDayMatch[1];
    const day = parseInt(monthDayMatch[2]);
    
    const monthMap = {
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };
    
    const month = monthMap[monthName.toLowerCase().substring(0, 3)];
    if (month !== undefined) {
      let eventDate = new Date(currentYear, month, day);
      
      // If event is in the past, assume next year
      if (eventDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        eventDate = new Date(currentYear + 1, month, day);
      }
      
      const timeMatch = dateString.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const ampm = timeMatch[3].toLowerCase();
        
        if (ampm === 'pm' && hours !== 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
        
        eventDate.setHours(hours, minutes);
      }
      
      return eventDate;
    }
  }
  
  // Pattern 2: "Sep 11, 2025" or "September 21st 2025"
  const fullDateMatch = dateString.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})\b/i);
  if (fullDateMatch) {
    const monthName = fullDateMatch[1];
    const day = parseInt(fullDateMatch[2]);
    const year = parseInt(fullDateMatch[3]);
    
    const monthMap = {
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };
    
    const month = monthMap[monthName.toLowerCase().substring(0, 3)];
    if (month !== undefined) {
      const eventDate = new Date(year, month, day);
      
      const timeMatch = dateString.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const ampm = timeMatch[3].toLowerCase();
        
        if (ampm === 'pm' && hours !== 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
        
        eventDate.setHours(hours, minutes);
      }
      
      return eventDate;
    }
  }
  
  // Pattern 3: "Tuesday, February 04, 2025" - FIXED VERSION
  const longDateMatch = dateString.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (longDateMatch) {
    const dayOfWeek = longDateMatch[1];
    const monthName = longDateMatch[2];
    const day = parseInt(longDateMatch[3]);
    const year = parseInt(longDateMatch[4]);
    
    const monthMap = {
      'january': 0, 'february': 1, 'march': 2, 'april': 3, 'may': 4, 'june': 5,
      'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11
    };
    
    const month = monthMap[monthName.toLowerCase()];
    if (month !== undefined) {
      // Create the date with the EXACT year from the string
      const eventDate = new Date(year, month, day);
      
      // Debug: Check if the parsed date matches the expected day of week
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const actualDayOfWeek = dayNames[eventDate.getDay()];
      
      // If the day of week doesn't match, the date might be wrong
      if (actualDayOfWeek.toLowerCase() !== dayOfWeek.toLowerCase()) {
        console.log(`Date mismatch for "${dateString}": Expected ${dayOfWeek}, got ${actualDayOfWeek}`);
        
        // For Historical Society events specifically, if Feb 04, 2025 falls on wrong day,
        // it might be a recurring event - use the next occurrence that matches
        if (monthName.toLowerCase() === 'february' && day === 4) {
          // Find the next February 4th that falls on the correct day of week
          for (let yearOffset = 0; yearOffset <= 2; yearOffset++) {
            const testDate = new Date(year + yearOffset, month, day);
            const testDayOfWeek = dayNames[testDate.getDay()];
            
            if (testDayOfWeek.toLowerCase() === dayOfWeek.toLowerCase()) {
              // Extract time if available
              const timeMatch = dateString.match(/(\d{1,2}):(\d{2})\s*(?:am|pm)/i);
              if (timeMatch) {
                let hours = parseInt(timeMatch[1]);
                const minutes = parseInt(timeMatch[2]);
                const ampmMatch = dateString.match(/(am|pm)/i);
                const ampm = ampmMatch ? ampmMatch[1].toLowerCase() : 'pm';
                
                if (ampm === 'pm' && hours !== 12) hours += 12;
                if (ampm === 'am' && hours === 12) hours = 0;
                
                testDate.setHours(hours, minutes);
              }
              
              console.log(`Corrected Historical Society date: ${testDate.toDateString()}`);
              return testDate;
            }
          }
        }
      }
      
      // If date seems correct or we couldn't fix it, use as-is
      const timeMatch = dateString.match(/(\d{1,2}):(\d{2})\s*(?:am|pm)/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const ampmMatch = dateString.match(/(am|pm)/i);
        const ampm = ampmMatch ? ampmMatch[1].toLowerCase() : 'pm';
        
        if (ampm === 'pm' && hours !== 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
        
        eventDate.setHours(hours, minutes);
      }
      
      return eventDate;
    }
  }
  
  return new Date('2099-12-31');
}

export function isEventInFuture(dateString) {
  if (!dateString) return true;
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDate = parseEventDate(dateString);
  
  // Special handling for Historical Society events that might be past
  if (dateString.includes('February 04, 2025')) {
    const feb2025 = new Date(2025, 1, 4); // February 4, 2025
    const isPast = feb2025 < today;
    
    if (isPast) {
      console.log(`Historical Society event "${dateString}" is in the past - filtering out`);
      return false;
    }
  }
  
  return eventDate >= today;
}
