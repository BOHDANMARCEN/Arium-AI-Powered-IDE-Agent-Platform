# Arium UI Shell

React-based frontend for Arium AI IDE & Agent Platform.

## Features

- Real-time event streaming via WebSocket
- File browser and editor
- Agent task interface
- Event log viewer
- Live connection status

## Development

```bash
cd app
npm install
npm start
```

The UI will be available at `http://localhost:3000` and will connect to the Arium server at `http://localhost:4000`.

## Environment Variables

- `REACT_APP_API_URL` - Backend API URL (default: http://localhost:4000)
- `REACT_APP_WS_URL` - WebSocket URL (default: ws://localhost:4000)

## Build

```bash
npm run build
```

Builds the app for production to the `build` folder.

