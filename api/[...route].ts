import express from 'express';
import { attachApiRoutes } from '../server/createApiApp.ts';

const app = express();
attachApiRoutes(app);

export default app;
