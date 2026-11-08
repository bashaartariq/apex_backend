import { Router } from 'express';
import { UsersController } from '../controllers/users.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/authorize';

export const usersRouter = Router();

// Staff management is restricted to SHOP_ADMIN or users with users.manage permission
usersRouter.use(authenticate);
usersRouter.use(requireRole('SHOP_ADMIN'));

usersRouter.get('/', UsersController.listUsers);
usersRouter.post('/', UsersController.createUser);
usersRouter.get('/:id', UsersController.getUser);
usersRouter.put('/:id', UsersController.updateUser);
usersRouter.patch('/:id/status', UsersController.updateStatus);
usersRouter.get('/:id/permissions', UsersController.getUserPermissions);
usersRouter.put('/:id/permissions', UsersController.updateUserPermissions);
