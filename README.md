# MCP Server for Logz.io

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)

A production-ready [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that enables AI assistants like Claude to interact with [Logz.io](https://logz.io/)'s log management platform. Search logs, execute complex queries, and retrieve statistics - all through natural language interactions.

## ✨ Features

- 🔍 **Search Logs**: Simple text searches with time ranges and filters
- 🧮 **Advanced Queries**: Execute powerful Lucene queries for precise log analysis  
- 📊 **Statistics**: Retrieve aggregated log metrics and trends
- 🚀 **High Performance**: Built with TypeScript, robust error handling, and retry logic
- 🛡️ **Production Ready**: Comprehensive validation, logging, and security best practices
- 🌍 **Multi-Region Support**: Supports all Logz.io regions (US, EU, CA, AU, UK)

## 🚀 Quick Start

### Installation Options

#### 1. Use directly with npx (Recommended)
```bash
# Always use latest version
npx mcp-server-logzio apiKey YOUR_API_KEY

# Use specific version for production
npx mcp-server-logzio@0.1.0 apiKey YOUR_API_KEY region eu
```

#### 2. Install globally
```bash
# Install latest version globally
npm install -g mcp-server-logzio

# Use the global installation
mcp-server-logzio apiKey YOUR_API_KEY
```

#### 3. Install locally in your project
```bash
# Add to your project
npm install mcp-server-logzio

# Use with npx from your project
npx mcp-server-logzio apiKey YOUR_API_KEY
```

### Basic Usage

```bash
# Start the server with your Logz.io credentials (defaults to US region)
npx mcp-server-logzio apiKey YOUR_API_KEY

# Specify a region
npx mcp-server-logzio apiKey YOUR_API_KEY region eu

# Use a custom URL
npx mcp-server-logzio apiKey YOUR_API_KEY logzioUrl https://api-ca.logz.io

# Using environment variables
export LOGZIO_API_KEY=your-api-key
export LOGZIO_REGION=eu
npx mcp-server-logzio
```

### Claude Configuration

Add this to your Claude configuration file:

```json
{
  "mcpServers": {
    "logzio": {
      "command": "npx",
      "args": [
        "mcp-server-logzio", 
        "apiKey", "YOUR_API_KEY",
        "region", "us"
      ]
    }
  }
}
```

For other regions:

```json
{
  "mcpServers": {
    "logzio": {
      "command": "npx", 
      "args": [
        "mcp-server-logzio",
        "apiKey", "YOUR_API_KEY",
        "region", "eu"
      ]
    }
  }
}
```

## 📖 Usage

Once connected, you can interact with your Logz.io logs through natural language:

### Search Examples

```
"Search for error logs in the last 24 hours"
"Find all logs containing 'database connection' from the web service"
"Show me warnings from the last 6 hours with more than 50 results"
```

### Advanced Query Examples

```
"Execute Lucene query: level:ERROR AND service:api"
"Search for status codes between 400 and 499 in the last hour"
"Find logs where message contains 'timeout' AND host:prod-*"
```

### Statistics Examples

```
"Get log statistics for the last 7 days grouped by severity level"
"Show me log volume trends for the past 24 hours"
"Analyze log distribution by Kubernetes namespace"
```

## 🛠️ Configuration

### Command Line Arguments

| Argument | Description | Default | Required |
|----------|-------------|---------|----------|
| `apiKey <key>` | Your Logz.io API key | - | Yes |
| `region <region>` | Logz.io region (us, us-west, eu, ca, au, uk) | us | No |
| `logzioUrl <url>` | Custom Logz.io API URL (overrides region) | - | No |
| `--timeout <ms>` | Request timeout | 30000 | No |
| `--retry-attempts <num>` | Retry attempts | 3 | No |
| `--max-results <num>` | Max results per query | 1000 | No |

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LOGZIO_API_KEY` | Alternative to `apiKey` argument | - |
| `LOGZIO_REGION` | Logz.io region | us |
| `LOGZIO_URL` | Custom API URL (overrides region) | - |
| `LOGZIO_TIMEOUT` | Request timeout in milliseconds | 30000 |
| `LOGZIO_RETRY_ATTEMPTS` | Number of retry attempts | 3 |
| `LOGZIO_MAX_RESULTS` | Maximum results per query | 1000 |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | info |

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

## 🏗️ Development

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
- `npm run lint` - Run ESLint
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

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](docs/CONTRIBUTING.md) for details.

### Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes following our code standards
4. Add tests for new functionality
5. Ensure all tests pass: `npm test`
6. Submit a pull request

### Code Standards

- Follow TypeScript best practices
- Maintain test coverage above 90%
- Use conventional commits
- Keep functions under 50 lines
- Keep files under 200 lines
- Add JSDoc comments for public APIs

## 📚 Documentation

- [API Documentation](docs/API.md)
- [Configuration Guide](docs/CONFIGURATION.md)
- [Contributing Guide](docs/CONTRIBUTING.md)
- [Examples](examples/)

## 🐛 Troubleshooting

### Common Issues

**Authentication Error**
```
Error: Unauthorized: Please check your API key
```
- Verify your API key is correct
- Ensure you're using the right region

**Connection Timeout**
```
Error: Request timeout
```
- Check your network connection
- Try increasing the timeout: `--timeout 60000`

**Rate Limiting**
```
Error: Rate limit exceeded
```
- The server automatically retries with backoff
- Reduce query frequency if persistent

### Debug Mode

Enable debug logging for troubleshooting:

```bash
LOG_LEVEL=debug npx mcp-server-logzio apiKey YOUR_KEY
```

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Logz.io](https://logz.io/) for their excellent logging platform
- [Model Context Protocol](https://modelcontextprotocol.io/) team for the MCP specification
- [Anthropic](https://anthropic.com/) for Claude and MCP support

---

**Made with ❤️ by the MCP Community**