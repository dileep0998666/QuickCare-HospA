const express = require("express")
const { logout } = require("../middleware/auth")
const router = express.Router()

// Logout route
router.post("/logout", logout)

// Session check route (for AJAX calls)
router.get("/session", (req, res) => {
  if (req.auth && req.auth.token) {
    res.json({
      success: true,
      hospitalId: req.auth.hospitalId,
      authenticated: true,
    })
  } else {
    res.status(401).json({
      success: false,
      authenticated: false,
    })
  }
})

module.exports = router
