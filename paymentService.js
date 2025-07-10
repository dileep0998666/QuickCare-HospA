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
      // Debug logs
      console.log("🧾 Initiating Razorpay payment with data:", {
        amount,
        currency,
        transactionId,
        doctorId,
        patientName,
      })

      if (!amount || isNaN(amount)) {
        throw new Error("Amount is missing or invalid.")
      }

      // Step 1: Verify Razorpay payment if verification details are provided
      if (razorpayPaymentId && razorpayOrderId && razorpaySignature) {
        return await this.verifyRazorpayPayment({
          razorpayPaymentId,
          razorpayOrderId,
          razorpaySignature,
          amount,
          currency,
        })
      }

      // Step 2: Create Razorpay order
      const amountInPaise = Math.round(amount * 100)
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

      console.log("📦 Creating Razorpay Order:", orderOptions)

      const order = await this.razorpayInstance.orders.create(orderOptions)

      console.log("✅ Razorpay Order created:", order)

      return {
        success: true,
        requiresAction: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        transactionId,
        razorpayOrderData: order,
      }
    } catch (error) {
      console.error("❌ Razorpay order creation failed:", error)
      throw new Error(`Razorpay payment failed: ${error?.message || "Unknown error"}`)
    }
  }

  async verifyRazorpayPayment({ razorpayPaymentId, razorpayOrderId, razorpaySignature, amount, currency }) {
    try {
      const body = razorpayOrderId + "|" + razorpayPaymentId
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest("hex")

      if (expectedSignature !== razorpaySignature) {
        throw new Error("Invalid payment signature")
      }

      const payment = await this.razorpayInstance.payments.fetch(razorpayPaymentId)

      if (!["captured", "authorized"].includes(payment.status)) {
        throw new Error(`Payment not successful. Status: ${payment.status}`)
      }

      return {
        success: true,
        transactionId: razorpayPaymentId,
        amount: payment.amount / 100,
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
      console.error("❌ Razorpay verification error:", error)
      throw new Error(`Payment verification failed: ${error?.message || "Unknown error"}`)
    }
  }

  async refundRazorpayPayment(paymentId, amount, reason = "Appointment cancelled") {
    try {
      const refundData = {
        amount: Math.round(amount * 100),
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
      console.error("❌ Razorpay refund error:", error)
      throw new Error(`Refund failed: ${error?.message || "Unknown error"}`)
    }
  }

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

  async stripePayment() {
    throw new Error("Stripe integration not implemented yet")
  }
}

module.exports = new PaymentService()
