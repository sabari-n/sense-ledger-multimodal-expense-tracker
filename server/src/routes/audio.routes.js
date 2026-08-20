import { Router } from 'express';
import { processAudio } from '../controllers/audio.controller.js';
import { upload } from '../middlewares/upload.middleware.js';

const router = Router();

// POST /api/audio/process — transcribe (+ optional LLM extract), no DB save
router.post('/process', upload.single('audio'), processAudio);

export default router;
