import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dashboardRouter = express.Router();

// Optional Authentication Middleware Placeholder
// In a real production system, you would uncomment this to protect your dashboard:
/*
function basicAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Nexus Admin"');
    return res.status(401).send('Authentication required.');
  }

  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const user = auth[0];
  const pass = auth[1];

  // Replace with env variables in production
  if (user === 'admin' && pass === process.env.ADMIN_PASSWORD || 'nexus-founder-2026') {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="Nexus Admin"');
    return res.status(401).send('Invalid credentials.');
  }
}
dashboardRouter.use('/admin', basicAuth);
*/

// Serve the admin.html file under GET /admin
dashboardRouter.get('/admin', (req, res) => {
  res.sendFile(path.resolve(path.join(process.cwd(), 'public', 'admin.html')));
});

export default dashboardRouter;
