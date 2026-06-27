import express from "express";
import {
  forgotPassword,
  getProfile,
  login,
  logout,
  resendOtp,
  resetPassword,
  verifyOtp
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);
router.post("/reset-password", resetPassword);
router.post("/logout", logout);
router.get("/me", protect, getProfile);
router.get("/profile", protect, getProfile);

export default router;
