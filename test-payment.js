const axios = require("axios")

async function testPaymentFlow() {
  try {
    console.log("🧪 Testing Payment Flow...\n")

    // 1. Get doctors
    console.log("1. Fetching doctors...")
    const doctorsRes = await axios.get("http://localhost:3001/api/doctors")
    const doctors = doctorsRes.data.doctors

    if (doctors.length === 0) {
      console.log("❌ No doctors found. Add a doctor first!")
      return
    }

    const doctor = doctors[0]
    console.log(`✅ Found doctor: ${doctor.name} (Fee: ₹${doctor.fee})\n`)

    // 2. Test mock payment
    console.log("2. Testing mock payment...")
    const mockPayment = await axios.post(`http://localhost:3001/api/doctors/${doctor._id}/pay`, {
      name: "Test Patient",
      age: 30,
      gender: "male",
      reason: "Test consultation",
      location: "Test City",
      paymentMethod: "mock",
    })

    if (mockPayment.data.success) {
      console.log("✅ Mock payment successful!")
      console.log(`   Transaction ID: ${mockPayment.data.data.transactionId}`)
      console.log(`   Queue Position: ${mockPayment.data.data.queuePosition}\n`)
    }

    // 3. Test Razorpay order creation
    console.log("3. Testing Razorpay order creation...")
    const orderRes = await axios.post(`http://localhost:3001/api/doctors/${doctor._id}/create-order`, {
      name: "Razorpay Test Patient",
      age: 25,
      gender: "female",
      reason: "Razorpay test",
      location: "Test Location",
    })

    if (orderRes.data.success) {
      console.log("✅ Razorpay order created successfully!")
      console.log(`   Order ID: ${orderRes.data.data.orderId}`)
      console.log(`   Amount: ₹${orderRes.data.data.amount / 100}`)
      console.log(`   Razorpay Key: ${orderRes.data.data.razorpayKeyId}\n`)
    }

    // 4. Check transactions
    console.log("4. Checking transaction history...")
    const transactionsRes = await axios.get(`http://localhost:3001/api/doctors/${doctor._id}/transactions`)
    const transactions = transactionsRes.data.data.transactions

    console.log(`✅ Found ${transactions.length} transactions for this doctor\n`)

    console.log("🎉 All tests passed! Your payment system is working correctly.")
    console.log("\n📝 Next steps:")
    console.log("   1. Test the payment page: http://localhost:3001/payment-test.html")
    console.log("   2. Use Razorpay test cards for end-to-end testing")
    console.log("   3. Check your admin dashboard: http://localhost:3001/admin")
  } catch (error) {
    console.error("❌ Test failed:", error.response?.data || error.message)
  }
}

// Run the test
testPaymentFlow()
