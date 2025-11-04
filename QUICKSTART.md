# Quick Start Guide

Get the XML Field Analyzer up and running in minutes!

## Installation (One-Time Setup)

1. **Open terminal/command prompt** in the project directory

2. **Install dependencies**:
   ```bash
   npm install
   ```
   This downloads all required packages (takes 1-2 minutes)

## Running the App

### Option 1: Web Browser (Recommended for Development)

```bash
npm start
```

- Opens automatically at `http://localhost:3000`
- Hot reload: Changes appear instantly
- Open browser DevTools with F12 for debugging

### Option 2: Desktop App (Electron)

```bash
npm run electron-dev
```

- Launches as a standalone desktop application
- Same functionality as web version
- Easier to test desktop-specific features

## Using the App

### Step 1: Upload XML Files

1. Click the upload area or drag files onto it
2. Select one or more `.xml` files
3. Files process immediately (all locally)

### Step 2: Analyze

**For a single file:**
- View statistics at the top
- Browse the fields table
- Search for specific fields
- Filter to show only nested fields

**For multiple files:**
- Click "Compare Files" tab
- See common fields across all files
- Identify unique fields per file
- View field variations

### Step 3: Export

- Click **"Export to CSV"** to download field analysis
- Click **"Export Report"** for comparison results
- Open CSV files in Excel, Google Sheets, or any text editor

## Example Workflow

1. Upload `SAMPLE_XML.xml` (included in the project)
2. View the field structure and nesting
3. Upload another XML file to compare
4. Export the comparison report
5. Modify the code and see changes in real-time

## Troubleshooting

**"Port 3000 already in use"**
- Close other apps using port 3000
- Or use: `PORT=3001 npm start`

**"npm: command not found"**
- Install Node.js from https://nodejs.org
- Restart terminal after installation

**"Files not uploading"**
- Ensure files are valid XML format
- Check file extension is `.xml`
- Try a different file

**"Electron app won't start"**
- Run `npm run build` first
- Ensure Node.js version is 16+
- Check console for error messages

## Next Steps

1. **Customize the UI**: Edit `src/App.css`
2. **Add features**: Create components in `src/components/`
3. **Build for distribution**: See `ELECTRON_SETUP.md`
4. **Deploy as web app**: See `README.md`

## File Structure

```
xml-analyzer-pwa/
├── src/                    # React source code
├── public/                 # Static files and Electron config
├── build/                  # Production build (created by npm run build)
├── package.json            # Project configuration
├── README.md               # Full documentation
├── ELECTRON_SETUP.md       # Electron-specific guide
└── QUICKSTART.md           # This file
```

## Key Commands

| Command | Purpose |
|---------|---------|
| `npm start` | Start web dev server |
| `npm run electron-dev` | Start Electron app |
| `npm run build` | Create production build |
| `npm test` | Run tests |
| `npm run build && npm run electron-build` | Build Electron app for distribution |

## Tips

- **Local Processing**: All data stays on your computer—no uploads
- **Offline Mode**: Works offline after first load (PWA feature)
- **Multiple Files**: Upload 2+ files to enable comparison
- **Search**: Use the search box to find specific fields
- **Export**: Download results as CSV for analysis in spreadsheet apps

## Support

- Check `README.md` for detailed documentation
- Review component code for implementation details
- See `ELECTRON_SETUP.md` for desktop app configuration

## What's Included

- ✅ React 19 with modern hooks
- ✅ Service Worker for offline support
- ✅ Electron configuration for desktop
- ✅ Responsive design (mobile-friendly)
- ✅ CSV export functionality
- ✅ Multi-file comparison
- ✅ Field nesting visualization

Happy analyzing! 🚀
