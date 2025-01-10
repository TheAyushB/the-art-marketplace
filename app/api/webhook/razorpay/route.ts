import { NextRequest, NextResponse } from "next/server";
import crypto from 'crypto'
import { connectToDatabase } from "@/lib/db";
import Order from "@/models/Order";
import nodemailer from "nodemailer";

export async function POST(request: NextRequest) {
    try {
        const body = await request.text();
        const signature = request.headers.get("x-razorpay-signature");

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
            .update(body)
            .digest("hex");

        if (expectedSignature !== signature) {
            return NextResponse.json(
                { error: "Invalid signature" },
                { status: 400 }
            );
        }

        const event = JSON.parse(body);
        await connectToDatabase();

        if (event.event === "payment.captured") {
            const payment = event.payload.payment.entity;

            const order = await Order.findOneAndUpdate(
                { razorpayOrderId: payment.order._id },
                {
                    razorpayPaymentId: payment.id,
                    status: "completed",
                    downloadUrl: payment.entity.notes.downloadUrl,
                    previewUrl: payment.entity.notes.previewUrl,
                }
            ).populate([
                { path: "productId", select: "name" },
                { path: "userId", select: "email" }
            ])

            if (order) {
                const transporter = nodemailer.createTransport({
                    service: "sandbox.smtp.mailtrap.io",
                    port: 2525,
                    auth: {
                        user: "c3842e1a0f1fd0",
                        pass: "3745ec2cd9b9ff",
                        // add these to .env
                    },
                });

                await transporter.sendMail({
                    from: "your@example.com",
                    to: order.userId.email,
                    subject: "Order Completed",
                    text: `Your order ${order.productId.name} has been successfully placed`,
                });
            }
        }

        return NextResponse.json(
            { message: "success" },
            { status: 200 }
        );

    } catch (error) {
        console.log(error);
        return NextResponse.json(
            { error: "Something went wrong" },
            { status: 500 });
    }
}

