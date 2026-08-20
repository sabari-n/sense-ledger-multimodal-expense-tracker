import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/index.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { metricsMiddleware } from './middlewares/metrics.middleware.js';
import { register } from './config/metrics.js';

const app = express();

// Core middleware
app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);

// Prometheus metrics scrape endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.setHeader('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (err) {
    res.status(500).end(err);
  }
});

// API routes
app.use('/api', apiRoutes);

// Central error handler — must be last
app.use(errorMiddleware);

export default app;
