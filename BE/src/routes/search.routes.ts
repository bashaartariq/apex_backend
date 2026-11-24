import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { searchGlobal } from '../controllers/search.controller';

export const searchRouter = Router();

searchRouter.get('/', authenticate, searchGlobal);
