import 'dotenv/config';
import express from 'express';
import { attachApiRoutes } from '../server/createApiApp.ts';

const app = express();
app.set('trust proxy', 1);
attachApiRoutes(app);

export default app;
