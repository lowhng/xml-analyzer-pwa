# Electron Setup Guide

This document provides detailed instructions for setting up and building the XML Field Analyzer as a desktop application using Electron.

## Overview

The project is pre-configured with Electron support. The key files are:

- **`public/electron.js`**: Main Electron process that creates the window and manages the app lifecycle
- **`public/preload.js`**: Preload script for secure IPC communication (if needed in the future)
- **`package.json`**: Contains Electron scripts and configuration

## Quick Start

### Development Mode

Run the app in development with hot reload:

```bash
npm run electron-dev
```

This command:
1. Starts the React development server on `http://localhost:3000`
2. Waits for the server to be ready
3. Launches the Electron app that loads the development server

The app will automatically reload when you make changes to the React code.

### Production Build

Build the app for production:

```bash
npm run build
```

Then run it with Electron:

```bash
npx electron public/electron.js
```

Or build a packaged app (requires additional setup):

```bash
npm run electron-build
```

## Configuration

### Electron Main Process (`public/electron.js`)

The main process configuration includes:

- **Window Size**: 1400x900 pixels (adjustable)
- **Dev Tools**: Automatically open in development mode
- **Security**: Context isolation enabled, Node integration disabled
- **Preload Script**: Security-focused preload script

To modify window properties, edit `public/electron.js`:

```javascript
mainWindow = new BrowserWindow({
  width: 1400,        // Change window width
  height: 900,        // Change window height
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    nodeIntegration: false,
    contextIsolation: true,
    enableRemoteModule: false,
  },
});
```

### Development vs Production

The app automatically detects the environment:

```javascript
const startUrl = isDev
  ? 'http://localhost:3000'           // Development: load from dev server
  : `file://${path.join(__dirname, '../build/index.html')}`; // Production: load from build
```

## Building for Distribution

To create a distributable Electron app, you'll need to install `electron-builder`:

```bash
npm install electron-builder --save-dev
```

Then update `package.json` with build configuration:

```json
{
  "build": {
    "appId": "com.xmlanalyzer.app",
    "productName": "XML Field Analyzer",
    "files": [
      "build/**/*",
      "public/electron.js",
      "public/preload.js",
      "node_modules/**/*"
    ],
    "directories": {
      "buildResources": "public"
    },
    "win": {
      "target": ["nsis", "portable"]
    },
    "mac": {
      "target": ["dmg", "zip"]
    },
    "linux": {
      "target": ["AppImage", "deb"]
    }
  }
}
```

Then build with:

```bash
npm run electron-build
```

## IPC Communication

If you need to communicate between the React app and Electron main process, use IPC:

### In `public/electron.js` (Main Process):

```javascript
const { ipcMain } = require('electron');

ipcMain.handle('my-channel', async (event, arg) => {
  // Handle message from renderer
  return 'response';
});
```

### In React Component:

```javascript
const result = await window.electronAPI.invoke('my-channel', 'data');
```

### In `public/preload.js`:

```javascript
const { ipcRenderer } = require('electron');

window.electronAPI = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
};
```

## Debugging

### Development

- Dev tools open automatically in development mode
- Use Chrome DevTools to debug React and JavaScript
- Console errors are displayed in the dev tools

### Production

To enable dev tools in production, modify `public/electron.js`:

```javascript
if (isDev) {
  mainWindow.webContents.openDevTools();
}
```

Change to:

```javascript
mainWindow.webContents.openDevTools(); // Always open
```

## Packaging

### macOS

For macOS, you'll need to sign the app:

```bash
npm run electron-build -- --publish=never
```

### Windows

For Windows, `electron-builder` creates:
- NSIS installer
- Portable executable

### Linux

For Linux, `electron-builder` creates:
- AppImage (single executable)
- DEB package (for Debian-based systems)

## Common Issues

### App Won't Start

1. Ensure `npm install` completed successfully
2. Check that `npm run build` succeeds
3. Verify Node.js version is 16+
4. Check console for error messages

### Dev Server Connection Failed

1. Ensure port 3000 is available
2. Check that `npm start` runs without errors
3. Verify `wait-on` is installed: `npm list wait-on`

### Build Fails

1. Clear node_modules and reinstall: `rm -rf node_modules && npm install`
2. Clear build cache: `rm -rf build`
3. Try building React first: `npm run build`

## Performance Optimization

### Code Splitting

React automatically code-splits in production builds. To optimize further:

```javascript
import React, { lazy, Suspense } from 'react';

const HeavyComponent = lazy(() => import('./HeavyComponent'));

export default () => (
  <Suspense fallback={<div>Loading...</div>}>
    <HeavyComponent />
  </Suspense>
);
```

### Bundle Size

Check bundle size with:

```bash
npm install -g source-map-explorer
source-map-explorer 'build/static/js/*.js'
```

## Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [Electron Builder](https://www.electron.build/)
- [React Documentation](https://react.dev)
- [Create React App Docs](https://create-react-app.dev/)

## Next Steps

1. Test the app in development mode: `npm run electron-dev`
2. Build for production: `npm run build`
3. Package the app: `npm run electron-build` (after installing `electron-builder`)
4. Distribute the packaged app to users

## Support

For Electron-specific issues, refer to the [Electron documentation](https://www.electronjs.org/docs/latest/).

For React-specific issues, check the [React documentation](https://react.dev).
