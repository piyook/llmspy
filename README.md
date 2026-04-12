# LMMSpy

A local developer tool for intercepting and displaying LLM API traffic in real-time.

## Features

- **HTTP/HTTPS Proxy**: Acts as a transparent proxy that intercepts LLM API calls
- **Real-time UI**: Live feed of intercepted requests with search and filtering
- **SSL Inspection**: Generates and manages CA certificates for HTTPS interception
- **Memory Storage**: Keeps last 500 requests in memory (no database required)
- **Multiple LLM Providers**: Supports OpenAI, Anthropic, Google Gemini, and configurable extras

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Development Server

```bash
npm run dev
```

This will start both the proxy server (port 8080) and the web UI (port 3000).

### 3. Trust the CA Certificate

The proxy generates a self-signed CA certificate to intercept HTTPS traffic. You must trust this certificate in your system:

#### macOS

```bash
# Add to Keychain
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/.lmmspy/ca.crt

# Or double-click the certificate and set "Always Trust" in Keychain Access
```

#### Windows

```powershell
# Import to Trusted Root Certification Authorities
certmgr.msc
# Right-click "Trusted Root Certification Authorities" -> "All Tasks" -> "Import"
# Browse to %USERPROFILE%\.lmmspy\ca.crt
```

#### Linux (Ubuntu/Debian)

```bash
# Copy to system certificates
sudo cp ~/.lmmspy/ca.crt /usr/local/share/ca-certificates/lmmspy.crt
sudo update-ca-certificates
```

### 4. Configure Proxy Environment Variables

Set the proxy environment variables in your terminal or application:

```bash
export HTTP_PROXY=http://localhost:8080
export HTTPS_PROXY=http://localhost:8080
```

For Windows PowerShell:
```powershell
$env:HTTP_PROXY="http://localhost:8080"
$env:HTTPS_PROXY="http://localhost:8080"
```

### 5. Use Your LLM Applications

Now any LLM API calls from your terminal or applications will be intercepted and displayed in the web UI at `http://localhost:3000`.

## Configuration

### Environment Variables

- `PROXY_PORT`: Proxy server port (default: 8080)
- `UI_PORT`: Web UI port (default: 3000)
- `LLM_HOSTS`: Comma-separated list of additional LLM hosts to intercept

Example:
```bash
export PROXY_PORT=8888
export LLM_HOSTS=api.custom-llm.com,api.another-provider.com
```

### Default LLM Hosts

The proxy automatically intercepts requests to:
- `api.anthropic.com` (Claude)
- `api.openai.com` (GPT)
- `generativelanguage.googleapis.com` (Gemini)

## Architecture

### Proxy Server (`packages/proxy`)

- **HTTP CONNECT Handler**: Handles HTTPS tunneling
- **SSL Interception**: Generates server certificates on-the-fly
- **Request Storage**: In-memory storage of intercepted requests
- **SSE Streaming**: Real-time updates to the web UI

### Web UI (`packages/ui`)

- **Svelte + Vite**: Modern web framework
- **Real-time Updates**: Server-Sent Events for live updates
- **Search & Filter**: Find specific requests quickly
- **JSON Viewer**: Expandable request/response details

## Development

### Project Structure

```
lmmspy/
packages/
  proxy/          # Node.js proxy server
    src/
      ca.ts       # Certificate authority management
      proxy.ts    # Main proxy server logic
      store.ts    # In-memory request storage
      types.ts    # TypeScript definitions
  ui/             # Svelte web interface
    src/
      App.svelte  # Main application component
      app.css     # Styles
      main.ts     # Entry point
```

### Scripts

- `npm run dev`: Start both proxy and UI in development mode
- `npm run build`: Build both packages
- `npm run start`: Start the proxy server only

### Adding New LLM Providers

To add support for additional LLM providers:

1. Add the host to the default list in `packages/proxy/src/index.ts`
2. Or set the `LLM_HOSTS` environment variable

## Security Considerations

- The proxy generates its own CA certificate - only use in development environments
- All intercepted traffic is stored in memory only
- The proxy only intercepts traffic to configured LLM hosts
- Other traffic is tunneled transparently

## Troubleshooting

### Certificate Issues

If you see SSL certificate errors:
1. Ensure the CA certificate is properly trusted
2. Restart your browser after installing the certificate
3. Clear browser SSL cache if needed

### Connection Issues

If requests aren't being intercepted:
1. Verify proxy environment variables are set
2. Check that the proxy server is running
3. Ensure the LLM host is in the interception list

### UI Not Loading

If the web UI doesn't load:
1. Check that port 3000 is available
2. Verify the proxy server is running on port 8080
3. Check browser console for CORS errors

## License

MIT License - see LICENSE file for details.
