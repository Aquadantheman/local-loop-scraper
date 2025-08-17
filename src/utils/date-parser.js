// src/utils/date-parser.js - Final fixed version
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
  
  // Pattern 3: "Tuesday, February 04, 2025" - CORRECTED
  const longDateMatch = dateString.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (longDateMatch) {
    const monthName = longDateMatch[2];
    const day = parseInt(longDateMatch[3]);
    const year = parseInt(longDateMatch[4]);
    
    const monthMap = {
      'january': 0, 'february': 1, 'march': 2, 'april': 3, 'may': 4, 'june': 5,
      'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11
    };
    
    const month = monthMap[monthName.toLowerCase()];
    if (month !== undefined) {
      // Use the ACTUAL YEAR from the string, don't modify it
      const eventDate = new Date(year, month, day);
      
      const timeMatch = dateString.match(/(\d{1,2}):(\d{2})\s*(?:am|pm)/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const ampmMatch = dateString.match(/(am|pm)/i);
        const ampm = ampmMatch ? ampmMatch[1].toLowerCase() : 'am';
        
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
  
  return eventDate >= today;
}
