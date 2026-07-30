# mandaybook

A web-based manday tracker for managing client project budgets. Plan activities, log actual work, and generate professional PDF/Excel reports.

## Features

- 📋 Plan activities and estimate manday allocation
- ✅ Log actual work (hours, minutes, stakeholders) day-by-day
- 📊 Real-time summary: remaining mandays, utilization %, status
- 📈 Quick stats (today / this week / this month)
- 🎨 Customizable theme color and company logo for reports
- 📥 Export to PDF (professional report), Excel (.xlsx), and JSON (backup)
- 🔀 Drag-to-reorder rows
- ⎘ Duplicate rows for repetitive entries
- 💾 Auto-save to browser storage

## Getting Started

### Option A: Open directly (simplest)

Because the app uses ES modules, you cannot just double-click `index.html` — browsers block module loading from `file://`. You need a local web server.

**Easiest way — VS Code Live Server extension:**

1. Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension in VS Code
2. Open this folder in VS Code
3. Right-click `index.html` → **Open with Live Server**
4. Browser opens automatically at `http://127.0.0.1:5500`

### Option B: Python's built-in server

```bash
cd mandaybook
python3 -m http.server 
```

Then open `http://localhost:8000` in your browser.

Employee search uses the server route at `/api/venio/employees`. To test both the
website and API locally, copy `.env.example` to `.env.local`, configure the Venio
credentials, then run `npm run dev`. Venio credentials must remain server-side
and must not be exposed through client code.

### Option C: Node's `serve` package

```bash
npx serve .
```

## Project Structure

```
mandaybook/
├── index.html                  # Main HTML file
├── README.md                   # This file
└── src/
    ├── styles/
    │   ├── main.css            # Imports all CSS files in order
    │   ├── variables.css       # Theme colors, fonts, spacing (edit me first!)
    │   ├── base.css            # Body, typography, reset
    │   ├── animations.css      # Keyframes
    │   └── components/         # One file per UI piece
    │       ├── header.css
    │       ├── buttons.css
    │       ├── cards.css
    │       ├── logo.css
    │       ├── settings.css
    │       ├── sections.css
    │       ├── tables.css
    │       ├── quick-stats.css
    │       ├── statement.css
    │       ├── dropdown.css
    │       └── toast.css
    └── js/
        ├── main.js             # Entry point — wires everything together
        ├── state.js            # Global state + browser storage persistence
        ├── utils.js            # Pure helpers: num, fmt, totalHrs, mandays
        ├── constants.js        # Default data, theme presets
        ├── render/             # Functions that update the DOM
        │   ├── plan.js
        │   ├── actual.js
        │   ├── summary.js
        │   ├── quickStats.js
        │   ├── logo.js
        │   └── settings.js
        ├── interactions/       # User input handlers
        │   ├── dragDrop.js
        │   └── dropdown.js
        ├── export/             # File generation
        │   ├── pdf.js
        │   ├── excel.js
        │   └── json.js
        └── ui/
            └── toast.js
```

## Where to Edit Things

| What you want to change           | File to edit                          |
| --------------------------------- | ------------------------------------- |
| Theme colors / fonts              | `src/styles/variables.css`            |
| Default plan/actual activities    | `src/js/constants.js`                 |
| Calculation logic (manday, hours) | `src/js/utils.js`                     |
| Plan table layout                 | `src/js/render/plan.js` + `tables.css`|
| PDF design                        | `src/js/export/pdf.js`                |
| Excel design                      | `src/js/export/excel.js`              |
| Status thresholds (Healthy/etc.)  | `src/js/render/summary.js`            |

## Dependencies (loaded via CDN — no install needed)

- [jsPDF](https://github.com/parallax/jsPDF) — PDF generation
- [ExcelJS](https://github.com/exceljs/exceljs) — Excel `.xlsx` with styling
- [FileSaver.js](https://github.com/eligrey/FileSaver.js) — Download trigger
- [Bai Jamjuree](https://fonts.google.com/specimen/Bai+Jamjuree) (Google Fonts) — Modern Thai font

## Browser Support

Modern evergreen browsers (Chrome, Edge, Firefox, Safari) — requires support for ES modules and CSS custom properties.

## License

Proprietary — internal use only.
