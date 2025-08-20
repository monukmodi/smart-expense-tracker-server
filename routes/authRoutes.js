import { Router } from 'express';
import { register, login } from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';
import { schemas } from '../validators/schemas.js';

const router = Router();

router.post('/register', validate(schemas.register, 'body'), register);
router.post('/login', validate(schemas.login, 'body'), login);

export default router;


