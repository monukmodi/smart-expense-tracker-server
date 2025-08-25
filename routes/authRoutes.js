import { Router } from 'express';
import { register, login, verify, resendCode, googleSignIn } from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';
import { schemas } from '../validators/schemas.js';

const router = Router();

router.post('/register', validate(schemas.register, 'body'), register);
router.post('/login', validate(schemas.login, 'body'), login);
router.post('/verify', validate(schemas.verify, 'body'), verify);
router.post('/resend-code', validate(schemas.resendCode, 'body'), resendCode);
router.post('/google', validate(schemas.googleSignIn, 'body'), googleSignIn);

export default router;


