const jwt = require("jsonwebtoken")
const axios = require("axios")

const CENTRAL_AUTH_URL = process.env.CENTRAL_AUTH_URL
const JWT_SECRET = process.env.JWT_SECRET
const CENTRAL_LOGIN_URL = process.env.CENTRAL_LOGIN_URL

async function requireAuth(req, res, next) {
  try {
    let authToken = req.cookies?.quickcare_auth_token

    // Check URL params for token (from central login redirect)
    if (!authToken && req.query.auth_token) {
      authToken = req.query.auth_token
      
      // Set secure cookie
      res.cookie("quickcare_auth_token", authToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
      })

      res.cookie("quickcare_hospital_id", req.query.hospital_id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", 
        maxAge: 8 * 60 * 60 * 1000,
      })

      return res.redirect("/admin")
    }

    if (!authToken) {
      return redirectToCentralLogin(res)
    }

    // Validate token
    const isValid = await validateToken(authToken, req.cookies?.quickcare_hospital_id)
    
    if (!isValid) {
      res.clearCookie("quickcare_auth_token")
      res.clearCookie("quickcare_hospital_id")
      return redirectToCentralLogin(res)
    }

    // Add auth info to request
    req.auth = {
      token: authToken,
      hospitalId: req.cookies?.quickcare_hospital_id || process.env.HOSPITAL_ID,
    }

    next()
  } catch (error) {
    console.error("Auth middleware error:", error)
    return redirectToCentralLogin(res)
  }
}

async function validateToken(token, hospitalId) {
  try {
    // First, verify JWT locally
    const decoded = jwt.verify(token, JWT_SECRET)
    
    // Then validate with central auth
    const response = await axios.post(
      `${CENTRAL_AUTH_URL}/auth/validate`,
      { hospitalId: hospitalId || process.env.HOSPITAL_ID },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      }
    )

    return response.data.success
  } catch (error) {
    console.error("Token validation error:", error.message)
    return false
  }
}

function redirectToCentralLogin(res) {
  return res.redirect(CENTRAL_LOGIN_URL)
}

async function logout(req, res) {
  try {
    const authToken = req.cookies?.quickcare_auth_token

    if (authToken) {
      try {
        await axios.post(
          `${CENTRAL_AUTH_URL}/auth/logout`,
          {},
          {
            headers: { Authorization: `Bearer ${authToken}` },
            timeout: 3000,
          }
        )
      } catch (error) {
        console.error("Logout notification error:", error.message)
      }
    }

    res.clearCookie("quickcare_auth_token")
    res.clearCookie("quickcare_hospital_id")
    res.redirect(CENTRAL_LOGIN_URL)
  } catch (error) {
    console.error("Logout error:", error)
    res.redirect(CENTRAL_LOGIN_URL)
  }
}

module.exports = { requireAuth, logout, validateToken }