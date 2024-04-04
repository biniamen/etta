/** @odoo-module */

import { BasePrinter } from "@point_of_sale/app/printer/base_printer";
import { patch } from "@web/core/utils/patch";

patch(BasePrinter.prototype, {
    setup(params) {
        super.setup(...arguments);
        const { rpc, url } = params;
        this.rpc = rpc;
        this.url = url;
    },
    async printReceipt(receipt, printer) {
        if (receipt) {
            this.receiptQueue.push(receipt);
        }
        let escposReceipt, printResult;
        while (this.receiptQueue.length > 0) {
            receipt = this.receiptQueue.shift();
            let escposReceipt = this.generateKitchenOrderReceipt(receipt, printer);
            // image = this.processCanvas(
            //     await htmlToCanvas(receipt, { addClass: "pos-receipt-print" })
            // );
            try {
                // printResult = await this.sendPrintingJob(image);
                let merged = {
                    printer: printer,
                    receipt: escposReceipt
                };

                if (window.Android.isAndroidPOS()) {
                    var result = window.Android.printTcp(merged);
                    var responseObject = JSON.parse(result);
                    console.log(responseObject);
                }
                else {
                    this.env.services.notification.add("Invalid Device", {
                        type: 'danger',
                        sticky: false,
                        timeout: 10000,
                    });
                }
            } catch {
                // Error in communicating to the IoT box.
                this.receiptQueue.length = 0;
                return this.getActionError();
            }
            // rpc call is okay but printing failed because
            // IoT box can't find a printer.
            if (!printResult || printResult.result === false) {
                this.receiptQueue.length = 0;
                return this.getResultsError(printResult);
            }
        }
        return { successful: true };
    },
    sendPrintingOrder(receipt, printer) {
        return this.rpc(`${this.url}/orderpinter/printorder`, { receipt, printer });
    },
    generateKitchenOrderReceipt(orderData, printer) {
        let receiptText = "[C]<u><font size='big'>" + printer.name + "</font></u>\n[L]\n";

        receiptText += "<b>Table:</b> " + orderData.table_name + "<br/>\n";
        receiptText += "<b>Floor:</b> " + orderData.floor_name + "<br/>\n";
        receiptText += "<b>Order Number:</b> " + orderData.name + "<br/>\n";
        receiptText += "<b>Cashier:</b> " + orderData.cashier + "<br/>\n";
        receiptText += "<b>Date:</b> " + orderData.date + "<br/>\n";
        receiptText += "<b>Time:</b> " + orderData.time.hours + ":" + orderData.time.minutes + "<br/>\n";
        receiptText += "[L]\n--------------------------------\n[L]\n";
        receiptText += "<b>ITEMS:</b>\n[L]\n";

        orderData.new.forEach(item => {
            receiptText += item.name + " x " + item.quantity + "\n";
        });

        return receiptText;
    }
});
