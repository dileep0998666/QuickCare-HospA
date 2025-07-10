const crypto = require("crypto")

class ValidationUtils {
  static validatePatientData(data) {
    const errors = []

    if (!data.name || data.name.trim().length < 2 || data.name.trim().length > 50) {
      errors.push("Patient name must be between 2-50 characters")
    }

    if (!/^[a-zA-Z\s]+$/.test(data.name)) {
      errors.push("Patient name can only contain letters and spaces")
    }

    if (!data.age || data.age < 1 || data.age > 120) {
      errors.push("Age must be between 1-120")
    }

    if (!["male", "female", "other"].includes(data.gender)) {
      errors.push("Gender must be male, female, or other")
    }

    if (!data.reason || data.reason.trim().length < 5 || data.reason.trim().length > 200) {
      errors.push("Reason must be between 5-200 characters")
    }

    if (data.location && data.location.length > 100) {
      errors.push("Location must be less than 100 characters")
    }

    return errors
  }

  static sanitizePatientData(patientData) {
    return {
      ...patientData,
      name: this.maskName(patientData.name),
      contactNumber: patientData.contactNumber ? this.maskContactNumber(patientData.contactNumber) : undefined,
    }
  }

  static maskName(name) {
    if (name.length <= 2) return "*".repeat(name.length)
    return name[0] + "*".repeat(name.length - 2) + name[name.length - 1]
  }

  static maskContactNumber(number) {
    if (number.length <= 4) return "*".repeat(number.length)
    return "*".repeat(number.length - 4) + number.slice(-4)
  }

  static generateTransactionRef() {
    return `TXN_${Date.now()}_${crypto.randomBytes(4).toString("hex").toUpperCase()}`
  }
}

module.exports = ValidationUtils
