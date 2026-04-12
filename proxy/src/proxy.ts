import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as url from 'url';
import { InterceptedRequest, ProxyConfig } from './types';
import { CertificateAuthority } from './ca';
import { RequestStore } from './store';

export class ProxyServer {
  private server: http.Server;
  private ca: CertificateAuthority;
  private store: RequestStore;
  private config: ProxyConfig;
  private sseClients: Set<http.ServerResponse>;

  constructor(config: ProxyConfig, store: RequestStore) {
    this.config = config;
    this.store = store;
    this.ca = new CertificateAuthority();
    this.sseClients = new Set();
    this.server = http.createServer();
    this.server.on('connect', this.handleConnect.bind(this));
    this.server.on('request', this.handleRequest.bind(this));
  }

  private isLLMHost(hostname: string): boolean {
    return this.config.llmHosts.some(host => hostname.includes(host));
  }

  private generateRequestId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private broadcastSSE(request: InterceptedRequest): void {
    const data = `data: ${JSON.stringify(request)}\n\n`;
    this.sseClients.forEach(client => {
      try {
        client.write(data);
      } catch (error) {
        this.sseClients.delete(client);
      }
    });
  }

  private async handleInterceptedRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    targetHost: string,
    targetPort: number
  ): Promise<void> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    const interceptedRequest: InterceptedRequest = {
      id: requestId,
      timestamp: new Date(),
      host: targetHost,
      method: req.method || 'GET',
      path: req.url || '/',
      headers: { ...req.headers as Record<string, string> },
      body: ''
    };

    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      interceptedRequest.body = body;

      try {
        const proxyReq = https.request({
          hostname: targetHost,
          port: targetPort,
          path: req.url,
          method: req.method,
          headers: req.headers
        }, (proxyRes) => {
          let responseBody = '';
          
          proxyRes.on('data', chunk => {
            responseBody += chunk.toString();
          });

          proxyRes.on('end', () => {
            const latency = Date.now() - startTime;
            interceptedRequest.response = {
              status: proxyRes.statusCode || 0,
              headers: proxyRes.headers as Record<string, string>,
              body: responseBody
            };
            interceptedRequest.latency = latency;

            this.store.addRequest(interceptedRequest);
            this.broadcastSSE(interceptedRequest);

            res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
            res.end(responseBody);
          });
        });

        proxyReq.on('error', (error) => {
          const latency = Date.now() - startTime;
          interceptedRequest.error = error.message;
          interceptedRequest.latency = latency;

          this.store.addRequest(interceptedRequest);
          this.broadcastSSE(interceptedRequest);

          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`Proxy Error: ${error.message}`);
        });

        proxyReq.write(body);
        proxyReq.end();

      } catch (error) {
        const latency = Date.now() - startTime;
        interceptedRequest.error = (error as Error).message;
        interceptedRequest.latency = latency;

        this.store.addRequest(interceptedRequest);
        this.broadcastSSE(interceptedRequest);

        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Proxy Error: ${(error as Error).message}`);
      }
    });
  }

  private handleConnect(req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer): void {
    const { hostname, port } = url.parse(`//${req.url}`, false, true) as { hostname: string; port: string };
    const targetPort = parseInt(port) || 443;

    if (this.isLLMHost(hostname)) {
      this.handleInterceptedConnect(hostname, targetPort, clientSocket, head);
    } else {
      this.handleTunnelConnect(hostname, targetPort, clientSocket, head);
    }
  }

  private handleInterceptedConnect(
    hostname: string,
    port: number,
    clientSocket: net.Socket,
    head: Buffer
  ): void {
    const { cert, key } = this.ca.generateServerCert(hostname);
    
    const serverSocket = new https.Server({
      cert,
      key,
      rejectUnauthorized: false
    });

    serverSocket.on('request', (req, res) => {
      this.handleInterceptedRequest(req, res, hostname, port);
    });

    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    clientSocket.pipe(serverSocket as any);
    serverSocket.pipe(clientSocket);
  }

  private handleTunnelConnect(
    hostname: string,
    port: number,
    clientSocket: net.Socket,
    head: Buffer
  ): void {
    const serverSocket = net.connect(port, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      serverSocket.write(head);
      clientSocket.pipe(serverSocket);
      serverSocket.pipe(clientSocket);
    });

    serverSocket.on('error', (error) => {
      clientSocket.end();
    });

    clientSocket.on('error', () => {
      serverSocket.end();
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.url === '/ping') {
      this.handlePing(req, res);
    } else if (req.url === '/events') {
      this.handleSSE(req, res);
    } else if (req.url === '/api/requests') {
      this.handleGetRequests(req, res);
    } else if (req.url === '/api/clear' && req.method === 'POST') {
      this.handleClearRequests(req, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }

  private handleSSE(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    this.sseClients.add(res);

    req.on('close', () => {
      this.sseClients.delete(res);
    });

    const requests = this.store.getRequests();
    requests.forEach(request => {
      res.write(`data: ${JSON.stringify(request)}\n\n`);
    });
  }

  private handleGetRequests(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(this.store.getRequests()));
  }

  private handlePing(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ 
      status: 'running',
      message: 'LMMSpy proxy server is running',
      timestamp: new Date().toISOString()
    }));
  }

  private handleClearRequests(req: http.IncomingMessage, res: http.ServerResponse): void {
    this.store.clear();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ success: true }));
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, () => {
        console.log(`Proxy server listening on port ${this.config.port}`);
        console.log(`CA certificate: ${this.ca.getCertPath()}`);
        resolve();
      });
      this.server.on('error', reject);
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('Proxy server stopped');
        resolve();
      });
    });
  }
}
