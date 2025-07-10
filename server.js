require("dotenv").config()
const express = require("express")
const mongoose = require("mongoose")
const path = require("path")
const Doctor = require("./doctorModel")
const Patient = require("./patientModel")
const Transaction = require("./transactionModel")
const paymentService = require("./paymentService")
const ValidationUtils = require("./validationUtils")

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use("/public", express.static(path.join(__dirname, "public")))

// Fixed hospital name
const HOSPITAL_NAME = "ABC Hospital"

// Admin page
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin.html"))
})

// Add doctor (updated to include fee)
app.post("/api/doctors", async (req, res) => {
  try {
    const { name, specialization, schedule, fee = 500, currency = "INR" } = req.body
    const newDoc = await Doctor.create({
      name,
      specialization,
      schedule: Array.isArray(schedule) ? schedule : [schedule],
      queue: [],
      fee: Number(fee),
      currency,
    })
    res.json(newDoc)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get active doctors (for central app)
app.get("/api/doctors", async (req, res) => {
  const docs = await Doctor.find({ active: true }, "-queue")
  res.json({ hospital: HOSPITAL_NAME, doctors: docs })
})

// Admin only: fetch all doctors
app.get("/api/admin/doctors", async (req, res) => {
  const doctors = await Doctor.find()
  res.json({ doctors })
})

// Get queue
app.get("/api/doctors/:id/queue", async (req, res) => {
  const doc = await Doctor.findById(req.params.id)
  res.json({ queue: doc.queue })
})

// 🆕 STEP 1: Create Razorpay order (initiate payment)
app.post("/api/doctors/:id/create-order", async (req, res) => {
  try {
    const doctorId = req.params.id
    const { name, age, gender, reason, location } = req.body

    // Validate input data
    const validationErrors = ValidationUtils.validatePatientData({ name, age, gender, reason, location })
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors,
      })
    }

    // Fetch doctor
    const doctor = await Doctor.findById(doctorId)
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      })
    }

    if (!doctor.active) {
      return res.status(400).json({
        success: false,
        message: "Doctor is currently unavailable",
      })
    }

    // Generate transaction reference
    const transactionRef = ValidationUtils.generateTransactionRef()

    // Create Razorpay order
    const paymentResult = await paymentService.processPayment("razorpay", {
      amount: doctor.fee,
      currency: doctor.currency,
      patientName: name,
      doctorId,
      transactionId: transactionRef,
    })

    if (paymentResult.success && paymentResult.requiresAction) {
      // Store temporary booking data (you might want to use Redis for this in production)
      // For now, we'll return the order details to frontend
      return res.json({
        success: true,
        message: "Razorpay order created successfully",
        data: {
          orderId: paymentResult.orderId,
          amount: paymentResult.amount,
          currency: paymentResult.currency,
          transactionId: transactionRef,
          doctorName: doctor.name,
          specialization: doctor.specialization,
          patientData: { name, age, gender, reason, location },
          razorpayKeyId: process.env.RAZORPAY_KEY_ID,
        },
      })
    }
  } catch (error) {
    console.error("❌ Order creation error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to create payment order",
      error: error.message,
    })
  }
})

// 🆕 STEP 2: Verify Razorpay payment and complete booking
app.post("/api/doctors/:id/verify-payment", async (req, res) => {
  const session = await mongoose.startSession()

  try {
    await session.startTransaction()

    const doctorId = req.params.id
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, patientData, transactionId } = req.body

    const { name, age, gender, reason, location } = patientData

    // Fetch doctor
    const doctor = await Doctor.findById(doctorId).session(session)
    if (!doctor) {
      await session.abortTransaction()
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      })
    }

    // Verify payment with Razorpay
    const paymentResult = await paymentService.processPayment("razorpay", {
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      razorpaySignature: razorpay_signature,
      amount: doctor.fee,
      currency: doctor.currency,
    })

    if (paymentResult.success) {
      // Create patient record
      const newPatient = new Patient({
        name,
        age,
        gender,
        reason,
        location,
        doctorId,
        visitedAt: new Date(),
      })

      const savedPatient = await newPatient.save({ session })

      // Calculate queue position
      const queuePosition = doctor.queue.length + 1

      // Create transaction record
      const transaction = new Transaction({
        doctorId,
        patientId: savedPatient._id,
        patientName: name,
        amount: paymentResult.amount,
        currency: paymentResult.currency,
        paymentStatus: "completed",
        paymentMethod: "razorpay",
        transactionId: paymentResult.transactionId,
        paymentGatewayResponse: paymentResult.gatewayResponse,
        queuePosition,
        patientDetails: { age, gender, reason, location },
      })

      await transaction.save({ session })

      // Add patient to doctor's queue
      doctor.queue.push({
        name,
        gender,
        reason,
        age,
        location,
        paymentStatus: "paid",
        transactionId: paymentResult.transactionId,
        joinedAt: new Date(),
      })

      await doctor.save({ session })

      await session.commitTransaction()

      console.log("✅ Razorpay payment verified and booking completed:", {
        transactionId: paymentResult.transactionId,
        doctorId,
        patientName: ValidationUtils.maskName(name),
        amount: paymentResult.amount,
        queuePosition,
      })

      return res.json({
        success: true,
        message: "Payment verified and appointment booked successfully",
        data: {
          transactionId: paymentResult.transactionId,
          patientId: savedPatient._id,
          doctorName: doctor.name,
          specialization: doctor.specialization,
          queuePosition,
          estimatedWaitTime: `${(queuePosition - 1) * 15} minutes`,
          amount: paymentResult.amount,
          currency: paymentResult.currency,
          paymentDetails: paymentResult.gatewayResponse,
          appointmentDetails: {
            reason,
            bookedAt: new Date().toISOString(),
          },
        },
      })
    }
  } catch (error) {
    await session.abortTransaction()

    console.error("❌ Payment verification error:", error)
    return res.status(400).json({
      success: false,
      message: "Payment verification failed",
      error: error.message,
    })
  } finally {
    await session.endSession()
  }
})

// 🆕 Refund payment
app.post("/api/transactions/:transactionId/refund", async (req, res) => {
  try {
    const { transactionId } = req.params
    const { reason = "Appointment cancelled by hospital" } = req.body

    // Find transaction
    const transaction = await Transaction.findOne({ transactionId })
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      })
    }

    if (transaction.paymentStatus !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot refund incomplete payment",
      })
    }

    // Process refund
    const refundResult = await paymentService.refundRazorpayPayment(
      transaction.transactionId,
      transaction.amount,
      reason,
    )

    if (refundResult.success) {
      // Update transaction status
      transaction.paymentStatus = "refunded"
      transaction.paymentGatewayResponse = {
        ...transaction.paymentGatewayResponse,
        refund: refundResult.refundData,
        refundedAt: new Date().toISOString(),
      }
      await transaction.save()

      return res.json({
        success: true,
        message: "Refund processed successfully",
        data: {
          refundId: refundResult.refundId,
          amount: refundResult.amount,
          status: refundResult.status,
        },
      })
    }
  } catch (error) {
    console.error("❌ Refund error:", error)
    return res.status(500).json({
      success: false,
      message: "Refund processing failed",
      error: error.message,
    })
  }
})

// Original payment route (now supports both mock and razorpay)
app.post("/api/doctors/:id/pay", async (req, res) => {
  const session = await mongoose.startSession()

  try {
    await session.startTransaction()

    const doctorId = req.params.id
    const { name, age, gender, reason, location, paymentMethod = "mock" } = req.body

    // Validate input data
    const validationErrors = ValidationUtils.validatePatientData({ name, age, gender, reason, location })
    if (validationErrors.length > 0) {
      await session.abortTransaction()
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors,
      })
    }

    // Fetch doctor and validate
    const doctor = await Doctor.findById(doctorId).session(session)
    if (!doctor) {
      await session.abortTransaction()
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      })
    }

    if (!doctor.active) {
      await session.abortTransaction()
      return res.status(400).json({
        success: false,
        message: "Doctor is currently unavailable",
      })
    }

    // Create patient record first
    const newPatient = new Patient({
      name,
      age,
      gender,
      reason,
      location,
      doctorId,
      visitedAt: new Date(),
    })

    const savedPatient = await newPatient.save({ session })

    // Calculate queue position
    const currentQueueLength = doctor.queue.length
    const queuePosition = currentQueueLength + 1

    // Create transaction record
    const transactionRef = ValidationUtils.generateTransactionRef()
    const transaction = new Transaction({
      doctorId,
      patientId: savedPatient._id,
      patientName: name,
      amount: doctor.fee,
      currency: doctor.currency,
      paymentStatus: "pending",
      paymentMethod,
      transactionId: transactionRef,
      queuePosition,
      patientDetails: { age, gender, reason, location },
    })

    const savedTransaction = await transaction.save({ session })

    // Process payment
    let paymentResult
    try {
      paymentResult = await paymentService.processPayment(paymentMethod, {
        amount: doctor.fee,
        currency: doctor.currency,
        patientName: name,
        doctorId,
        transactionId: transactionRef,
      })
    } catch (paymentError) {
      // Update transaction status to failed
      savedTransaction.paymentStatus = "failed"
      savedTransaction.paymentGatewayResponse = {
        error: paymentError.message,
        timestamp: new Date().toISOString(),
      }
      await savedTransaction.save({ session })

      await session.abortTransaction()

      return res.status(400).json({
        success: false,
        message: "Payment processing failed",
        error: paymentError.message,
        transactionId: transactionRef,
      })
    }

    // Payment successful - update records
    if (paymentResult.success) {
      // Update transaction
      savedTransaction.paymentStatus = "completed"
      savedTransaction.transactionId = paymentResult.transactionId
      savedTransaction.paymentGatewayResponse = paymentResult.gatewayResponse
      await savedTransaction.save({ session })

      // Add patient to doctor's queue with payment info
      doctor.queue.push({
        name,
        gender,
        reason,
        age,
        location,
        paymentStatus: "paid",
        transactionId: paymentResult.transactionId,
        joinedAt: new Date(),
      })
      await doctor.save({ session })

      await session.commitTransaction()

      return res.status(200).json({
        success: true,
        message: "Payment successful and appointment booked",
        data: {
          transactionId: paymentResult.transactionId,
          patientId: savedPatient._id,
          doctorName: doctor.name,
          specialization: doctor.specialization,
          queuePosition,
          estimatedWaitTime: `${(queuePosition - 1) * 15} minutes`,
          amount: doctor.fee,
          currency: doctor.currency,
          appointmentDetails: {
            reason,
            bookedAt: new Date().toISOString(),
          },
        },
      })
    }
  } catch (error) {
    await session.abortTransaction()

    console.error("❌ Payment processing error:", error)
    return res.status(500).json({
      success: false,
      message: "Internal server error during payment processing",
      error: process.env.NODE_ENV === "development" ? error.message : "Something went wrong",
    })
  } finally {
    await session.endSession()
  }
})

// Get payment history for a doctor
app.get("/api/doctors/:id/transactions", async (req, res) => {
  try {
    const doctorId = req.params.id
    const { page = 1, limit = 10, status } = req.query

    const query = { doctorId }
    if (status) {
      query.paymentStatus = status
    }

    const transactions = await Transaction.find(query)
      .populate("patientId", "name age gender")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec()

    const total = await Transaction.countDocuments(query)

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
        },
      },
    })
  } catch (error) {
    console.error("Error fetching transactions:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching transaction history",
    })
  }
})

// Get all transactions (admin)
app.get("/api/admin/transactions", async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query

    const query = {}
    if (status) {
      query.paymentStatus = status
    }

    const transactions = await Transaction.find(query)
      .populate("doctorId", "name specialization")
      .populate("patientId", "name age gender")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec()

    const total = await Transaction.countDocuments(query)

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
        },
      },
    })
  } catch (error) {
    console.error("Error fetching all transactions:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching transaction history",
    })
  }
})

// Original join queue route (kept for backward compatibility)
app.post("/api/doctors/:id/join", async (req, res) => {
  const doctor = await Doctor.findById(req.params.id)
  if (!doctor) return res.status(404).json({ error: "Doctor not found" })

  const patient = {
    name: req.body.name,
    gender: req.body.gender,
    reason: req.body.reason,
    age: req.body.age,
    location: req.body.location,
    paymentStatus: "pending",
  }

  doctor.queue.push(patient)
  await doctor.save()

  await Patient.create({
    ...patient,
    doctorId: doctor._id,
  })

  res.json({ position: doctor.queue.length })
})

// Get patient status in queue
app.get("/api/doctors/:id/status", async (req, res) => {
  const { name } = req.query
  const doc = await Doctor.findById(req.params.id)
  const pos = doc.queue.findIndex((p) => p.name === name)
  res.json({ position: pos >= 0 ? pos + 1 : null })
})

// Next patient (dequeue)
app.post("/api/doctors/:id/next", async (req, res) => {
  const doc = await Doctor.findById(req.params.id)
  const [next, ...rest] = doc.queue
  doc.queue = rest
  await doc.save()
  res.json({ next })
})

// Toggle active/inactive
app.post("/api/admin/doctors/:id/toggle", async (req, res) => {
  const doc = await Doctor.findById(req.params.id)
  if (!doc) return res.status(404).json({ error: "Doctor not found" })

  doc.active = !doc.active
  await doc.save()
  res.json({ active: doc.active })
})

// Accept POST too (for compatibility with frontend)
app.post("/api/admin/doctors/:id/fee", async (req, res) => {
  try {
    const { fee, currency = "INR" } = req.body

    if (!fee || fee < 0) {
      return res.status(400).json({ error: "Invalid fee amount" })
    }

    const doc = await Doctor.findByIdAndUpdate(
      req.params.id,
      { fee: Number(fee), currency },
      { new: true }
    )

    if (!doc) return res.status(404).json({ error: "Doctor not found" })

    res.json({ success: true, doctor: doc })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update doctor fee
app.put("/api/admin/doctors/:id/fee", async (req, res) => {
  try {
    const { fee, currency = "INR" } = req.body

    if (!fee || fee < 0) {
      return res.status(400).json({ error: "Invalid fee amount" })
    }

    const doc = await Doctor.findByIdAndUpdate(req.params.id, { fee: Number(fee), currency }, { new: true })

    if (!doc) return res.status(404).json({ error: "Doctor not found" })

    res.json({ success: true, doctor: doc })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get("/api/admin/patients/:doctorId", async (req, res) => {
  const patients = await Patient.find({ doctorId: req.params.doctorId })
  res.json({ patients })
})

app.get("/api/admin/patients", async (req, res) => {
  const patients = await Patient.find().populate("doctorId")
  res.json({ patients })
})
app.get("/", (req, res) => {
  res.redirect("/admin");
});


// Connect to MongoDB and start server
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected")
    app.listen(process.env.PORT || 3001, () => console.log("🚀 Hospital server running at http://localhost:3001/admin"))
  })
  .catch((err) => console.error("❌ MongoDB failed:", err))
