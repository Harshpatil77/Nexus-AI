import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dashboardRouter = express.Router();

export function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return res.status(503).send('Admin dashboard is not configured. Set ADMIN_PASSWORD.');
  }

  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Nexus Admin"');
    return res.status(401).send('Authentication required.');
  }

  const [scheme, encodedCredentials] = authHeader.split(' ');
  if (scheme !== 'Basic' || !encodedCredentials) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Nexus Admin"');
    return res.status(401).send('Invalid authentication format.');
  }

  const credentials = Buffer.from(encodedCredentials, 'base64').toString('utf8');
  const separatorIndex = credentials.indexOf(':');
  if (separatorIndex === -1) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Nexus Admin"');
    return res.status(401).send('Invalid credentials.');
  }

  const user = credentials.slice(0, separatorIndex);
  const pass = credentials.slice(separatorIndex + 1);
  const expected = Buffer.from(`${adminUsername}:${adminPassword}`);
  const actual = Buffer.from(`${user}:${pass}`);

  if (actual.length === expected.length && crypto.timingSafeEqual(actual, expected)) {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="Nexus Admin"');
    return res.status(401).send('Invalid credentials.');
  }
}
dashboardRouter.use('/admin', adminAuth);

// Serve the admin.html file under GET /admin
dashboardRouter.get('/admin', (req, res) => {
  res.sendFile(path.resolve(path.join(process.cwd(), 'public', 'admin.html')));
});

export default dashboardRouter;
