# MCP Server for Logz.io

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that enables AI assistants like Claude to interact with [Logz.io](https://logz.io/)'s log management platform. Search logs, execute complex queries, and retrieve statistics - all through natural language interactions.

## ✨ Features

- 🔍 **Search Logs**: Simple text searches with time ranges and filters
- 🧮 **Advanced Queries**: Execute powerful Lucene queries for precise log analysis  
- 📊 **Statistics**: Retrieve aggregated log metrics and trends
- 🚀 **High Performance**: Built with TypeScript, robust error handling, and retry logic
- 🌍 **Multi-Region Support**: Supports all Logz.io regions (US, EU, CA, AU, UK)

## 🚀 Quick Start

Add this to your Claude/Cursor/etc configuration file:

```python
{
  "mcpServers": {
    
    # other servers ...
    
    "logzio": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-server-logzio", 
        "apiKey", "YOUR_LOGZIO_API_KEY"
      ]
    }
  }
}
```

US is the default region. For other regions:

```python
{
  "mcpServers": {
    
    # other servers ...
    
    "logzio": {
      "command": "npx", 
      "args": [
        "-y",
        "mcp-server-logzio",
        "apiKey", "YOUR_LOGZIO_API_KEY",
        "region", "eu" # add this for example
      ]
    }
  }
}
```

## 🛠️ Advanced Configuration

### Command Line Arguments

| Argument | Description | Default | Required |
|----------|-------------|---------|----------|
| `apiKey <key>` | Your Logz.io API key | - | Yes |
| `region <region>` | Logz.io region (us, us-west, eu, ca, au, uk) | us | No |
| `logzioUrl <url>` | Custom Logz.io API URL (overrides region) | - | No |
| `--timeout <ms>` | Request timeout | 30000 | No |
| `--retry-attempts <num>` | Retry attempts | 3 | No |
| `--max-results <num>` | Max results per query | 1000 | No |

### Supported Regions

The server automatically maps region codes to the correct Logz.io API endpoints:

| Region Code | Description | API Endpoint |
|-------------|-------------|--------------|
| `us` | US East (default) | `https://api.logz.io` |
| `us-west` | US West | `https://api-wa.logz.io` |
| `eu` | Europe | `https://api-eu.logz.io` |
| `ca` | Canada | `https://api-ca.logz.io` |
| `au` | Australia | `https://api-au.logz.io` |
| `uk` | United Kingdom | `https://api-uk.logz.io` |

**Finding Your Region**: Log into your Logz.io account and check the URL in your browser:
- `https://app.logz.io` → use region `us`
- `https://app-eu.logz.io` → use region `eu`
- `https://app-ca.logz.io` → use region `ca`
- etc.

## 🔧 Available Tools

### `search_logs`
Search through logs with simple queries and filters.

**Parameters:**
- `query` (required): Search query string
- `timeRange`: Time range (1h, 6h, 12h, 24h, 3d, 7d, 30d)
- `from`/`to`: Custom time range (ISO 8601)
- `logType`: Filter by log type
- `severity`: Filter by severity level
- `limit`: Maximum results (1-1000)
- `sort`: Sort order (asc/desc)

### `query_logs`
Execute advanced Lucene queries for precise log analysis.

**Parameters:**
- `luceneQuery` (required): Lucene query string
- `from`/`to`: Time range (ISO 8601)
- `size`: Maximum results (1-1000)
- `sort`: Sort order (asc/desc)

### `get_log_stats`
Retrieve aggregated log statistics and metrics.

**Parameters:**
- `timeRange`: Time range (1h, 6h, 12h, 24h, 3d, 7d, 30d)
- `from`/`to`: Custom time range (ISO 8601)
- `groupBy`: Fields to group by

## 🏗️ Development, if you want to mess with the code

### Prerequisites

- Node.js 18+
- TypeScript 5.3+
- Valid Logz.io account and API key

### Setup

```bash
# Clone the repository
git clone https://github.com/modelcontextprotocol/mcp-server-logzio.git
cd mcp-server-logzio

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run in development mode
npm run dev
```

### Scripts

- `npm run build` - Compile TypeScript
- `npm run dev` - Run in development mode
- `npm test` - Run test suite
- `npm run format` - Format code with Prettier
- `npm run type-check` - Type check without emission

## 📁 Project Structure

```
mcp-server-logzio/
├── src/
│   ├── api/           # Logz.io API client and types
│   ├── tools/         # MCP tool implementations
│   ├── utils/         # Utilities (logging, errors)
│   ├── config.ts      # Configuration management
│   ├── server.ts      # MCP server implementation
│   └── index.ts       # Entry point
├── tests/             # Test suites
├── examples/          # Usage examples
├── docs/              # Documentation
└── dist/              # Compiled output
```

## 🙏 Acknowledgments

- [Logz.io](https://logz.io/) for their excellent logging platform
- [Model Context Protocol](https://modelcontextprotocol.io/) team for the MCP specification
- [Cursor](https://www.cursor.com/) / [Claude](https://claude.ai/) for writing 99% of the code in this project