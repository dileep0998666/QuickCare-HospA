const { body, param, validationResult } = require("express-validator")

const validatePaymentRequest = [
  param("id").isMongoId().withMessage("Invalid doctor ID"),
  body("patientName")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Patient name must be between 2-50 characters")
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage("Patient name can only contain letters and spaces"),
  body("age").isInt({ min: 1, max: 120 }).withMessage("Age must be between 1-120"),
  body("gender").isIn(["male", "female", "other"]).withMessage("Gender must be male, female, or other"),
  body("reason").trim().isLength({ min: 5, max: 200 }).withMessage("Reason must be between 5-200 characters"),
  body("location").optional().trim().isLength({ max: 100 }).withMessage("Location must be less than 100 characters"),
  body("contactNumber")
    .optional()
    .matches(/^[+]?[\d\s\-()]+$/)
    .withMessage("Invalid contact number format"),
  body("paymentMethod").optional().isIn(["mock", "stripe", "razorpay"]).withMessage("Invalid payment method"),
]

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    })
  }
  next()
}

module.exports = {
  validatePaymentRequest,
  handleValidationErrors,
}
