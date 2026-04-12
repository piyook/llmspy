import { ProxyConfig } from './types';
import { RequestStore } from './store';
import { ProxyServer } from './proxy';

const config: ProxyConfig = {
  port: parseInt(process.env.PROXY_PORT || '8080'),
  uiPort: parseInt(process.env.UI_PORT || '3000'),
  llmHosts: [
    'api.anthropic.com',
    'api.openai.com',
    'generativelanguage.googleapis.com',
    ...(process.env.LLM_HOSTS?.split(',') || [])
  ],
  maxRequests: 500
};

const store = new RequestStore(config.maxRequests);
const proxy = new ProxyServer(config, store);

async function start() {
  try {
    await proxy.start();
    console.log(`🚀 LMMSpy proxy server started on port ${config.port}`);
    console.log(`📊 UI available at http://localhost:${config.uiPort}`);
    console.log(`🔐 CA certificate: ${new (await import('./ca')).CertificateAuthority().getCertPath()}`);
    console.log(`\n📋 Setup instructions:`);
    console.log(`1. Install dependencies: npm install`);
    console.log(`2. Trust the CA certificate (see README)`);
    console.log(`3. Set environment variables:`);
    console.log(`   export HTTP_PROXY=http://localhost:${config.port}`);
    console.log(`   export HTTPS_PROXY=http://localhost:${config.port}`);
    console.log(`4. Start the UI: cd packages/ui && npm run dev`);
  } catch (error) {
    console.error('Failed to start proxy server:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down proxy server...');
  await proxy.stop();
  process.exit(0);
});

start();
