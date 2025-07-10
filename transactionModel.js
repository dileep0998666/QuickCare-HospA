const mongoose = require("mongoose")

const transactionSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    patientName: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      enum: ["INR", "USD"],
      default: "INR",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["mock", "stripe", "razorpay", "cash"],
      default: "mock",
    },
    transactionId: {
      type: String,
      unique: true,
      sparse: true,
    },
    paymentGatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
    },
    queuePosition: {
      type: Number,
      required: true,
    },
    patientDetails: {
      age: Number,
      gender: String,
      reason: String,
      location: String,
    },
  },
  {
    timestamps: true,
  },
)

// Indexes for efficient queries
transactionSchema.index({ doctorId: 1, createdAt: -1 })
transactionSchema.index({ patientId: 1 })
transactionSchema.index({ transactionId: 1 })

module.exports = mongoose.model("Transaction", transactionSchema)
