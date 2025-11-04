# XML Field Analyzer - Progressive Web App

A modern, sleek Progressive Web App (PWA) for analyzing XML files locally. Extract field information, detect nesting structures, compare multiple files, and export results to CSV. All processing happens locally in your browser—no data is sent to any server.

## Features

- **Local Processing**: All XML parsing and analysis happens in your browser. No data leaves your device.
- **Field Detection**: Automatically extract all fields from XML files with detailed metadata.
- **Nesting Visualization**: See the depth and hierarchy of nested fields at a glance.
- **Multi-File Comparison**: Upload multiple XML files and compare their field structures.
- **CSV Export**: Export field analysis and comparison reports to CSV format.
- **Modern UI**: Clean, responsive design that works on desktop and mobile.
- **PWA Support**: Install as a standalone app on your device.
- **Electron Ready**: Pre-configured to wrap as a desktop application using Electron.

## Getting Started

### Prerequisites

- Node.js 16+ and npm (or yarn/pnpm)
- Git (optional)

### Installation

1. **Clone or extract the project**:
   ```bash
   cd xml-analyzer-pwa
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

### Running the App

#### Development Mode (Web)

Start the development server:
```bash
npm start
```

The app will open at `http://localhost:3000` in your default browser.

#### Development Mode (Electron)

To run the app as an Electron desktop application:
```bash
npm run electron-dev
```

This will start both the React development server and the Electron app simultaneously.

#### Production Build (Web)

Build the app for production:
```bash
npm run build
```

The optimized build will be in the `build/` directory.

#### Production Build (Electron)

Build and package as an Electron application:
```bash
npm run electron-build
```

## Usage

### Uploading XML Files

1. Click the upload area or drag and drop XML files
2. Multiple files can be uploaded at once
3. Files are processed immediately in your browser

### Analyzing a Single File

1. Select a file from the list on the left sidebar
2. View statistics including:
   - Total number of fields
   - Unique field names
   - Maximum nesting depth
   - Count of nested fields
3. Browse the fields table with details about each field:
   - Field name and nesting depth
   - Whether it has child elements
   - Text content presence
   - Attributes
   - Occurrence count

### Searching and Filtering

- Use the search box to find specific fields by name
- Filter to show only nested fields with the checkbox

### Comparing Multiple Files

1. Upload 2 or more XML files
2. Click the "Compare Files" tab
3. View:
   - **Common Fields**: Fields present in all files
   - **Differences**: Fields with variations across files
   - **Unique Fields**: Fields unique to each file

### Exporting Data

- **Single File**: Click "Export to CSV" in the Fields Viewer to export field analysis
- **Comparison**: Click "Export Report" in the Comparison View to export comparison results

## Project Structure

```
xml-analyzer-pwa/
├── public/
│   ├── electron.js              # Electron main process
│   ├── preload.js               # Electron preload script
│   ├── service-worker.js        # PWA service worker
│   ├── manifest.json            # PWA manifest
│   └── index.html               # HTML template
├── src/
│   ├── components/
│   │   ├── FileUpload.js        # File upload component
│   │   ├── FieldsViewer.js      # Fields display and export
│   │   ├── Statistics.js        # Statistics cards
│   │   └── ComparisonView.js    # Multi-file comparison
│   ├── utils/
│   │   └── xmlParser.js         # XML parsing and analysis logic
│   ├── App.js                   # Main app component
│   ├── App.css                  # App styling
│   ├── index.js                 # React entry point
│   └── index.css                # Global styles
├── package.json                 # Dependencies and scripts
└── README.md                    # This file
```

## Technical Details

### XML Parsing

The app uses the browser's native `DOMParser` API to parse XML files. This ensures:
- No external dependencies for XML parsing
- Full control over error handling
- Compatibility with all modern browsers

### Field Analysis

The parser extracts:
- **Field Name**: The XML element name
- **Depth**: Nesting level (0 = root)
- **Path**: Full hierarchical path
- **Nesting Info**: Whether the field is nested
- **Children**: Count of child elements
- **Text Content**: Whether the field contains text
- **Attributes**: XML attributes on the element
- **Occurrences**: How many times the field appears

### Comparison Logic

When comparing files, the app:
1. Collects all unique field names across files
2. Identifies common fields (present in all files)
3. Tracks unique fields per file
4. Detects depth variations for the same field name
5. Generates a detailed difference report

### PWA Features

- **Service Worker**: Caches app assets for offline access
- **Manifest**: Enables installation as a standalone app
- **Responsive Design**: Works on all screen sizes
- **Local Storage**: All processing is client-side

## Wrapping with Electron

The project is pre-configured for Electron. To build a desktop app:

1. Ensure all dependencies are installed:
   ```bash
   npm install
   ```

2. Build the React app:
   ```bash
   npm run build
   ```

3. Build the Electron app:
   ```bash
   npm run electron-build
   ```

The Electron configuration includes:
- Main process in `public/electron.js`
- Preload script for security in `public/preload.js`
- Development mode with hot reload
- Production build support

For more details, see the [Electron documentation](https://www.electronjs.org/docs).

## Browser Compatibility

- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Performance

The app is optimized for performance:
- Efficient XML parsing with streaming
- Memoized component rendering
- Lazy loading of large field lists
- Minimal bundle size (~100KB gzipped)

## Privacy

**All data stays local.** The app:
- Does not send data to any server
- Does not use analytics or tracking
- Does not require internet connection (after first load)
- Can be used completely offline

## Troubleshooting

### Service Worker Not Registering

If the service worker fails to register:
1. Check browser console for errors
2. Ensure you're on HTTPS or localhost
3. Clear browser cache and try again

### XML Parse Errors

If you see "Invalid XML format":
1. Verify the XML file is well-formed
2. Check for encoding issues (UTF-8 recommended)
3. Ensure the file isn't corrupted

### Electron App Not Starting

If the Electron app fails to start:
1. Ensure `npm install` completed successfully
2. Try `npm run build` first
3. Check the console for error messages
4. Verify Node.js version is 16 or higher

## Development

### Adding New Features

1. Create new components in `src/components/`
2. Add utility functions to `src/utils/`
3. Update `src/App.js` to integrate new features
4. Style with CSS in `src/App.css` or component-specific CSS

### Building for Production

```bash
npm run build
```

This creates an optimized production build in the `build/` directory.

### Testing

Run tests with:
```bash
npm test
```

## License

This project is provided as-is for your use.

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the component code and comments
3. Consult the Electron documentation for desktop app issues

## Future Enhancements

Potential features for future versions:
- XML validation against schemas
- Visual XML tree editor
- Custom field filtering and sorting
- Batch processing of multiple files
- Dark mode theme
- Field statistics and analytics
- Integration with cloud storage
