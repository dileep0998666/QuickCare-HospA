const crypto = require("crypto")

class SecurityUtils {
  // Hash sensitive data for logging
  static hashSensitiveData(data) {
    return crypto.createHash("sha256").update(data).digest("hex").substring(0, 8)
  }

  // Sanitize patient data for logging
  static sanitizePatientData(patientData) {
    return {
      ...patientData,
      name: this.maskName(patientData.name),
      contactNumber: patientData.contactNumber ? this.maskContactNumber(patientData.contactNumber) : undefined,
    }
  }

  // Mask patient name for logs (keep first and last character)
  static maskName(name) {
    if (name.length <= 2) return "*".repeat(name.length)
    return name[0] + "*".repeat(name.length - 2) + name[name.length - 1]
  }

  // Mask contact number
  static maskContactNumber(number) {
    if (number.length <= 4) return "*".repeat(number.length)
    return "*".repeat(number.length - 4) + number.slice(-4)
  }

  // Generate unique transaction reference
  static generateTransactionRef() {
    return `TXN_${Date.now()}_${crypto.randomBytes(4).toString("hex").toUpperCase()}`
  }
}

module.exports = SecurityUtils
