# Local Loop - Multi-Town Event Scraper

> 🏘️ **Scalable event scraping architecture for hyper-local newsletters**

A modular event scraping system designed to collect local events from multiple towns and feed them into newsletter automation systems. Built for the **Local Loop** business model - hyper-local subscription newsletters.

## 🚀 Features

- ✅ **Multi-town architecture** - Easily expand to new locations
- ✅ **Modular source scrapers** - Each venue/organization has its own scraper
- ✅ **Automated deduplication** - Smart hash-based event filtering
- ✅ **Future event filtering** - Only upcoming events
- ✅ **Airtable integration** - Direct database updates
- ✅ **Error isolation** - Single source failures don't break entire scrape
- ✅ **Comprehensive logging** - Detailed progress tracking

## 🏘️ Currently Supported Towns

### West Islip, NY
- **West Islip Public Library** (~125 events)
- **West Islip Chamber of Commerce** (community events)
- **West Islip Country Fair** (annual event)
- **West Islip Historical Society** (historical events)
- **West Islip Fire Department** (public events)

**Total: ~128 events per scrape**

## 📁 Architecture

```
src/
├── main.js                    # Main orchestrator
├── utils/                     # Shared utilities
│   ├── date-parser.js        # Date parsing & validation
│   ├── hash-generator.js     # Event deduplication
│   └── airtable.js          # Database integration
└── towns/                    # Town-specific scrapers
    └── west-islip/
        ├── index.js          # Town coordinator
        └── sources/          # Individual venue scrapers
            ├── library.js
            ├── chamber.js
            ├── fire-dept.js
            ├── historical.js
            └── country-fair.js
```

## 🔧 Setup

### Environment Variables
Set these in your Apify actor or environment:

```bash
AIRTABLE_TOKEN=pat_your_token_here
AIRTABLE_BASE_ID=app_your_base_here
```

### Airtable Schema
Your `RawEvents` table should have these fields:
- `source_name` (Single line text)
- `title_raw` (Long text)
- `description_raw` (Long text)
- `start_raw` (Single line text)
- `location_raw` (Single line text)
- `url_raw` (URL)
- `category_hint` (Single line text)
- `fetched_at` (Date)
- `hash` (Single line text)

## 🏗️ Adding New Towns

### 1. Create Town Structure
```bash
src/towns/your-town/
├── index.js          # Town coordinator
└── sources/          # Venue scrapers
    ├── library.js
    ├── chamber.js
    └── venue1.js
```

### 2. Update Main Orchestrator
In `src/main.js`, add your town to the towns array:

```javascript
const towns = [
  {
    name: 'West Islip',
    scraper: scrapeWestIslip,
    enabled: true
  },
  {
    name: 'Your Town',
    scraper: scrapeYourTown,  // Import this
    enabled: true
  }
];
```

### 3. Create Town Coordinator
Copy `src/towns/west-islip/index.js` as a template and update the sources.

### 4. Create Source Scrapers
Each venue gets its own scraper file. Follow the pattern in existing source files.

## 📊 Output Data

Each event contains:
```javascript
{
  title_raw: "Event Title",
  description_raw: "Event description...",
  start_raw: "August 15: 7:00pm - 9:00pm",
  location_raw: "Venue Name",
  url_raw: "https://event-url.com",
  category_hint: "library - adults",
  source: "Source Organization",
  fetched_at: "2025-08-15T10:30:00.000Z",
  hash: "unique_hash_for_deduplication"
}
```

## 🎯 Business Model Integration

This scraper is designed to feed into newsletter automation systems:

1. **Scrape events** → Airtable
2. **Airtable** → Make.com/Zapier automation  
3. **Automation** → Newsletter generation
4. **Newsletter** → Subscriber delivery (Beehiiv, ConvertKit, etc.)

## 🔍 Logging & Monitoring

The scraper provides detailed logging:
- ✅ **Town-level results** - Events per town
- ✅ **Source-level results** - Events per venue
- ✅ **Error isolation** - Failed sources don't break others
- ✅ **Data quality** - Past event filtering, deduplication stats
- ✅ **Integration status** - Airtable upload confirmation

## 🛠️ Development

### Running Locally
```bash
npm install
npm start
```

### Testing Individual Sources
Each source scraper can be tested independently by importing and running the specific function.

### Adding Debug Mode
Set `debug: true` in input to see browser actions and get more verbose logging.

## 📈 Scaling Strategy

### Phase 1: Single Town Prototype
- ✅ West Islip working (128+ events)
- ✅ Airtable integration
- ✅ Newsletter automation

### Phase 2: Regional Expansion  
- 🎯 East Islip (similar sources)
- 🎯 Babylon (expand source types)
- 🎯 Huntington (larger market)

### Phase 3: Business Model Validation
- 🎯 Subscription metrics
- 🎯 Revenue per town
- 🎯 Operational efficiency

## 🤝 Contributing

When adding new towns or sources:

1. **Follow the modular pattern** - Each source gets its own file
2. **Use the shared utilities** - Don't duplicate date parsing, etc.
3. **Handle errors gracefully** - Failed sources shouldn't break the scrape
4. **Test thoroughly** - Verify event extraction and deduplication
5. **Update documentation** - Add your town to this README

## 📝 License

MIT - Build your Local Loop empire! 🏰
