const express = require("express")
const mongoose = require("mongoose")
const Doctor = require("../models/Doctor")
const Patient = require("../models/Patient")
const Transaction = require("../models/Transaction")
const paymentService = require("../services/paymentService")
const { validatePaymentRequest, handleValidationErrors } = require("../middleware/validation")
const SecurityUtils = require("../utils/security")

const router = express.Router()

// POST /api/doctors/:id/pay - Process payment and book appointment
router.post("/doctors/:id/pay", validatePaymentRequest, handleValidationErrors, async (req, res) => {
  const session = await mongoose.startSession()

  try {
    await session.startTransaction()

    const doctorId = req.params.id
    const { patientName, age, gender, reason, location, contactNumber, paymentMethod = "mock" } = req.body

    // 1. Fetch doctor and validate
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

    // 2. Create patient record first
    const newPatient = new Patient({
      name: patientName,
      age,
      gender,
      reason,
      location,
      contactNumber,
      doctorId,
      visitedAt: new Date(),
    })

    const savedPatient = await newPatient.save({ session })

    // 3. Calculate queue position
    const currentQueueLength = doctor.queue.length
    const queuePosition = currentQueueLength + 1

    // 4. Create transaction record
    const transactionRef = SecurityUtils.generateTransactionRef()
    const transaction = new Transaction({
      doctorId,
      patientId: savedPatient._id,
      patientName,
      amount: doctor.fee,
      currency: doctor.currency,
      paymentStatus: "pending",
      paymentMethod,
      transactionId: transactionRef,
      queuePosition,
      metadata: {
        reason,
        age,
        gender,
      },
    })

    const savedTransaction = await transaction.save({ session })

    // 5. Process payment
    let paymentResult
    try {
      paymentResult = await paymentService.processPayment(paymentMethod, {
        amount: doctor.fee,
        currency: doctor.currency,
        patientName,
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

    // 6. Payment successful - update records
    if (paymentResult.success) {
      // Update transaction
      savedTransaction.paymentStatus = "completed"
      savedTransaction.transactionId = paymentResult.transactionId
      savedTransaction.paymentGatewayResponse = paymentResult.gatewayResponse
      await savedTransaction.save({ session })

      // Add patient to doctor's queue
      doctor.queue.push({
        patientId: savedPatient._id,
        position: queuePosition,
        joinedAt: new Date(),
      })
      await doctor.save({ session })

      await session.commitTransaction()

      // Log successful transaction (with sanitized data)
      console.log("Payment successful:", {
        transactionId: paymentResult.transactionId,
        doctorId,
        patientData: SecurityUtils.sanitizePatientData({ name: patientName }),
        amount: doctor.fee,
        queuePosition,
      })

      return res.status(200).json({
        success: true,
        message: "Payment successful and appointment booked",
        data: {
          transactionId: paymentResult.transactionId,
          patientId: savedPatient._id,
          doctorName: doctor.name,
          specialization: doctor.specialization,
          queuePosition,
          estimatedWaitTime: `${(queuePosition - 1) * 15} minutes`, // Assuming 15 min per patient
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

    console.error("Payment processing error:", {
      error: error.message,
      doctorId: req.params.id,
      patientName: SecurityUtils.maskName(req.body.patientName || "Unknown"),
    })

    return res.status(500).json({
      success: false,
      message: "Internal server error during payment processing",
      error: process.env.NODE_ENV === "development" ? error.message : "Something went wrong",
    })
  } finally {
    await session.endSession()
  }
})

// GET /api/doctors/:id/transactions - Get payment history for a doctor
router.get("/doctors/:id/transactions", async (req, res) => {
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

module.exports = router
