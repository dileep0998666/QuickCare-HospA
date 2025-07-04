const crypto = require("crypto")
const Razorpay = require("razorpay")

class PaymentService {
  constructor() {
    // Initialize Razorpay instance
    this.razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })

    this.providers = {
      mock: this.mockPayment.bind(this),
      razorpay: this.razorpayPayment.bind(this),
      stripe: this.stripePayment.bind(this),
    }
  }

  async processPayment(provider, paymentData) {
    if (!this.providers[provider]) {
      throw new Error(`Payment provider ${provider} not supported`)
    }

    return await this.providers[provider](paymentData)
  }

  // Razorpay payment processing
  async razorpayPayment({
    amount,
    currency,
    patientName,
    doctorId,
    transactionId,
    razorpayPaymentId,
    razorpayOrderId,
    razorpaySignature,
  }) {
    try {
      // If payment verification data is provided, verify the payment
      if (razorpayPaymentId && razorpayOrderId && razorpaySignature) {
        return await this.verifyRazorpayPayment({
          razorpayPaymentId,
          razorpayOrderId,
          razorpaySignature,
          amount,
          currency,
        })
      }

      // Create Razorpay order
      const amountInPaise = Math.round(amount * 100) // Convert to paise
      const orderOptions = {
        amount: amountInPaise,
        currency: currency || "INR",
        receipt: transactionId,
        notes: {
          patientName,
          doctorId,
          hospitalBooking: true,
        },
      }

      const order = await this.razorpayInstance.orders.create(orderOptions)

      return {
        success: true,
        requiresAction: true, // Indicates frontend needs to show Razorpay checkout
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        transactionId,
        razorpayOrderData: order,
      }
    } catch (error) {
      console.error("Razorpay payment error:", error)
      throw new Error(`Razorpay payment failed: ${error.message}`)
    }
  }

  // Verify Razorpay payment signature
  async verifyRazorpayPayment({ razorpayPaymentId, razorpayOrderId, razorpaySignature, amount, currency }) {
    try {
      // Create signature for verification
      const body = razorpayOrderId + "|" + razorpayPaymentId
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest("hex")

      if (expectedSignature !== razorpaySignature) {
        throw new Error("Invalid payment signature")
      }

      // Fetch payment details from Razorpay
      const payment = await this.razorpayInstance.payments.fetch(razorpayPaymentId)

      if (payment.status !== "captured" && payment.status !== "authorized") {
        throw new Error(`Payment not successful. Status: ${payment.status}`)
      }

      return {
        success: true,
        transactionId: razorpayPaymentId,
        amount: payment.amount / 100, // Convert back from paise
        currency: payment.currency,
        gatewayResponse: {
          status: "completed",
          razorpayPaymentId,
          razorpayOrderId,
          paymentMethod: payment.method,
          bank: payment.bank,
          wallet: payment.wallet,
          vpa: payment.vpa,
          email: payment.email,
          contact: payment.contact,
          timestamp: new Date().toISOString(),
        },
      }
    } catch (error) {
      console.error("Razorpay verification error:", error)
      throw new Error(`Payment verification failed: ${error.message}`)
    }
  }

  // Refund payment via Razorpay
  async refundRazorpayPayment(paymentId, amount, reason = "Appointment cancelled") {
    try {
      const refundData = {
        amount: Math.round(amount * 100), // Convert to paise
        notes: {
          reason,
          refundedAt: new Date().toISOString(),
        },
      }

      const refund = await this.razorpayInstance.payments.refund(paymentId, refundData)

      return {
        success: true,
        refundId: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
        refundData: refund,
      }
    } catch (error) {
      console.error("Razorpay refund error:", error)
      throw new Error(`Refund failed: ${error.message}`)
    }
  }

  // Mock payment for testing (95% success rate)
  async mockPayment({ amount, currency, patientName, doctorId }) {
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const isSuccess = Math.random() > 0.05
    const transactionId = `MOCK_${Date.now()}_${crypto.randomBytes(4).toString("hex").toUpperCase()}`

    if (isSuccess) {
      return {
        success: true,
        transactionId,
        amount,
        currency,
        gatewayResponse: {
          status: "completed",
          message: "Mock payment successful",
          timestamp: new Date().toISOString(),
          mockData: true,
        },
      }
    } else {
      throw new Error("Mock payment failed - insufficient funds")
    }
  }

  // Placeholder for Stripe integration
  async stripePayment(paymentData) {
    throw new Error("Stripe integration not implemented yet")
  }
}

module.exports = new PaymentService()
