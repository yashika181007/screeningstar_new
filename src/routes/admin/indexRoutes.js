const express = require("express");
const router = express.Router();
const authController = require("../../controllers/admin/authController");
const adminController = require("../../controllers/admin/adminController");

// Authentication routes
router.post("/login", authController.login);
router.put("/update-password", authController.updatePassword);
router.post("/forgot-password-request", authController.forgotPasswordRequest);
router.post("/forgot-password", authController.forgotPassword);
router.get("/logout", authController.logout);
router.get("/list", adminController.list);
router.post("/verify-admin-login", authController.validateLogin);

module.exports = router;
