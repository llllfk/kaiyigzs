import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { ensureProjectEnv } from './lib/env';

// Custom server (tsx) does not auto-load .env.local — load before reading env.
ensureProjectEnv();

const dev = process.env.COZE_PROJECT_ENV !== 'PROD';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '5000', 10);

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  server.once('error', err => {
    console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : process.env.COZE_PROJECT_ENV
      }`,
    );
    console.log(
      `> WECOM_WEBHOOK_URL: ${
        process.env.WECOM_WEBHOOK_URL?.trim() ? 'configured' : 'MISSING'
      }`,
    );
    console.log(
      `> DATABASE_URL: ${
        process.env.DATABASE_URL?.trim() ? 'configured' : 'MISSING'
      }`,
    );
  });
});
