const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 8000;

// Set to false when you want to use the real printer via PrintNode
const SIMULATION_MODE = process.env.SIMULATION_MODE === "true";

// PrintNode credentials
const PRINTNODE_API_KEY = process.env.PRINTNODE_API_KEY; // Replace with your real API key
const PRINTER_ID = process.env.PRINTER_ID; // Replace with your real printer ID

const LOG_FILE = path.join(__dirname, "printer_simulation.log");

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Mock printer for simulation mode
class MockPrinter {
  constructor() {
    this.buffer = [];
    this.currentAlign = "left";
    this.currentBold = false;
  }

  alignLeft() {
    this.currentAlign = "left";
    return this;
  }
  alignCenter() {
    this.currentAlign = "center";
    return this;
  }
  alignRight() {
    this.currentAlign = "right";
    return this;
  }
  bold(enabled = true) {
    this.currentBold = enabled;
    return this;
  }

  println(text) {
    let formatted = text;
    if (this.currentBold) formatted = `**${formatted}**`;
    if (this.currentAlign === "center")
      formatted = formatted.padStart(40 + formatted.length / 2);
    if (this.currentAlign === "right") formatted = formatted.padStart(80);
    this.buffer.push(formatted);
    return this;
  }

  drawLine() {
    this.buffer.push("--------------------------------");
    return this;
  }

  cut() {
    this.buffer.push("=== CUT HERE ===");
    return this;
  }

  async execute() {
    const receipt = this.buffer.join("\n");
    fs.writeFileSync(LOG_FILE, receipt);
    console.log("SIMULATION: Receipt saved to", LOG_FILE);
    return true;
  }
}

// Format receipt text
const generateReceiptText = (order) => {
  const printer = new MockPrinter();

  // Header
  printer
    .alignCenter()
    .bold(true)
    .println(order.businessName)
    .bold(false)
    .println(order.businessAddress.googleFormattedAddress)
    .println(`Tel: ${order.businessPhoneNumber || "N/A"}`)
    .drawLine();

  // Order Info
  printer
    .alignLeft()
    .println(`Order #: ${order.orderNumber}`)
    .println(`Date: ${new Date(order.createdDate).toLocaleString()}`)
    .println(`Status: ${order.fulfillmentStatus}`)
    .println(`Fulfillment: ${order.fulfillmentMethod}`)
    .drawLine();

  // Customer Details
  printer
    .bold(true)
    .println("CUSTOMER DETAILS")
    .bold(false)
    .println(
      `${order.customerDetails.firstName} ${order.customerDetails.lastName}`
    )
    .println(`Phone: ${order.customerDetails.phone}`)
    .println(`Email: ${order.customerDetails.email}`);

  if (order.fulfillmentMethod === "Delivery" && order.pickupAddress) {
    printer.println("Delivery Address:");
    printer.println(order.pickupAddress.addressLine);
    printer.println(
      `${order.pickupAddress.city}, ${order.pickupAddress.subdivision} ${order.pickupAddress.postalCode}`
    );
  }
  printer.drawLine();

  // Order Items
  printer.bold(true).println("ORDER ITEMS").bold(false);

  order.lineItems.forEach((item) => {
    printer
      .println(`${item.quantity}x ${item.name} (${item.variant})`)
      .println(`  ${item.price}`);

    if (item.specialRequests) {
      printer.println(`  Special Requests: ${item.specialRequests}`);
    }

    if (item.modifiers) {
      printer.println(`  Modifiers: ${item.modifiers}`);
    }

    printer.drawLine();
  });

  // Price Summary
  printer
    .bold(true)
    .println("PRICE SUMMARY")
    .bold(false)
    .println(`Subtotal: ${order.priceSummary.subtotalFormattedAmount}`)
    .println(`Tax: ${order.priceSummary.taxFormattedAmount}`);

  if (order.priceSummary.shippingAmount > 0) {
    printer.println(`Delivery: ${order.priceSummary.shippingFormattedAmount}`);
  }

  if (order.priceSummary.discountAmount > 0) {
    printer.println(`Discount: -${order.priceSummary.discountFormattedAmount}`);
  }

  printer
    .bold(true)
    .println(`TOTAL: ${order.priceSummary.totalFormattedAmount}`)
    .bold(false)
    .drawLine();

  // Payment Status
  printer
    .println(
      `Payment Status: ${order.paymentStatus === "PAID" ? "PAID" : "NOT PAID"}`
    )
    .drawLine();

  // Footer
  printer
    .alignCenter()
    .println("Thank you for your order!")
    .println(order.websiteUrl)
    .cut();

  return printer;
};

// Print Receipt Endpoint
app.post("/print-receipt", async (req, res) => {
  const order = req.body.data;

  if (!order) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Order data is required",
    });
  }

  try {
    const receiptText = generateReceiptText(order);

    if (SIMULATION_MODE) {
      const printer = new MockPrinter();

      // Header
      printer
        .alignCenter()
        .bold(true)
        .println(order.businessName)
        .bold(false)
        .println(order.businessAddress.googleFormattedAddress)
        .println(`Tel: ${order.businessPhoneNumber || "N/A"}`)
        .drawLine();

      // Order Info
      printer
        .alignLeft()
        .println(`Order #: ${order.orderNumber}`)
        .println(`Date: ${new Date(order.createdDate).toLocaleString()}`)
        .println(`Status: ${order.fulfillmentStatus}`)
        .println(`Fulfillment: ${order.fulfillmentMethod}`)
        .drawLine();

      // Customer Details
      printer
        .bold(true)
        .println("CUSTOMER DETAILS")
        .bold(false)
        .println(
          `${order.customerDetails.firstName} ${order.customerDetails.lastName}`
        )
        .println(`Phone: ${order.customerDetails.phone}`)
        .println(`Email: ${order.customerDetails.email}`);

      if (order.fulfillmentMethod === "Delivery" && order.pickupAddress) {
        printer.println("Delivery Address:");
        printer.println(order.pickupAddress.addressLine);
        printer.println(
          `${order.pickupAddress.city}, ${order.pickupAddress.subdivision} ${order.pickupAddress.postalCode}`
        );
      }
      printer.drawLine();

      // Order Items
      printer.bold(true).println("ORDER ITEMS").bold(false);

      order.lineItems.forEach((item) => {
        let price = item.price;
        price = price.substr(2);
        printer
          .println(`${item.title} x${item.quantity}`)
          .println(`Price: $${item.price}`)
          .println(`Total: $${(item.quantity * price).toFixed(2)}`)
          .drawLine();
      });

      // Price Summary
      printer
        .bold(true)
        .println("PRICE SUMMARY")
        .bold(false)
        .println(`Subtotal: ${order.priceSummary.subtotalFormattedAmount}`)
        .println(`Tax: ${order.priceSummary.taxFormattedAmount}`);

      if (order.priceSummary.shippingAmount > 0) {
        printer.println(
          `Delivery: ${order.priceSummary.shippingFormattedAmount}`
        );
      }

      if (order.priceSummary.discountAmount > 0) {
        printer.println(
          `Discount: -${order.priceSummary.discountFormattedAmount}`
        );
      }

      printer
        .bold(true)
        .println(`TOTAL: ${order.priceSummary.totalFormattedAmount}`)
        .bold(false)
        .drawLine();

      // Payment Status
      printer
        .println(
          `Payment Status: ${
            order.paymentStatus === "PAID" ? "PAID" : "NOT PAID"
          }`
        )
        .drawLine();

      // Footer
      printer
        .alignCenter()
        .println("Thank you for your order!")
        .println(order.websiteUrl)
        .cut();

      await printer.execute();

      return res.status(200).json({
        success: true,
        message: "Simulation successful",
        receipt: fs.readFileSync(LOG_FILE, "utf8"),
      });
    } else {
      const cutCommand = Buffer.from([0x1d, 0x56, 0x42, 0x00]);
      const fullBuffer = Buffer.concat([
        Buffer.from(receiptText, "utf8"),
        cutCommand,
      ]);

      const content = fullBuffer.toString("base64");

      // Send to PrintNode
      const response = await axios.post(
        "https://api.printnode.com/printjobs",
        {
          printerId: PRINTER_ID,
          title: "Order Receipt",
          contentType: "raw_base64",
          content: content,
        },
        {
          auth: {
            username: PRINTNODE_API_KEY,
            password: "",
          },
        }
      );

      return res.status(200).json({
        success: true,
        message: "Sent to printer via PrintNode",
        jobId: response.data.id,
      });
    }
  } catch (error) {
    console.error("Printing error:", error);
    return res.status(500).json({
      error: "Printing Failed",
      message: error.message,
      mode: SIMULATION_MODE ? "SIMULATION" : "PRODUCTION",
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🖨️ Server running on http://localhost:${port}`);
  console.log(`Mode: ${SIMULATION_MODE ? "SIMULATION" : "PRODUCTION"}`);
});
