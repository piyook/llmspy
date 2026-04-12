// Simple API endpoint for server-side API key management
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load environment variables from .env file
function loadEnv() {
  const envPath = join(process.cwd(), '..', '.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, ...values] = line.split('=');
      if (key && values.length > 0) {
        process.env[key.trim()] = values.join('=').trim();
      }
    });
  }
}

// Load environment variables
loadEnv();

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  return new Response(JSON.stringify({
    hasApiKey: !!apiKey,
    keyLength: apiKey ? apiKey.length : 0
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
