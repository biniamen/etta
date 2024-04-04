/** @odoo-module */

import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { patch } from "@web/core/utils/patch";
import { ConfirmPopup } from "@point_of_sale/app/utils/confirm_popup/confirm_popup";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

patch(ReceiptScreen.prototype, {
    setup() {
        super.setup();
        this.popup = useService("popup");
    },
    async printReceipt() {
        var receiptData = this.pos.get_order().export_for_printing();
        receiptData.tenant = "odoo17";
        receiptData.client = this.pos.get_order().get_partner();
        console.log(this.pos.config.discount_pc)
        console.log("RECEIPT DATA");
        console.log(receiptData);

        let customer = {};

        if (receiptData.client != null) {
            customer.customerName = receiptData.client.name;
            customer.customerTradeName = "";
            customer.customerTIN = receiptData.client.vat;
            customer.customerPhoneNo = receiptData.client.phone;
        }

        let orderlinesFromOrder = this.pos.get_order().orderlines;
        let isRefundOrder = this.pos.is_refund_order();

        let extractedOrderlines = orderlinesFromOrder.map(orderline => {
            return {
                id: orderline.product.id,
                pluCode: orderline.product.default_code ? orderline.product.default_code : "00007",
                productName: orderline.product.display_name,
                productDescription: orderline.product.description ? orderline.product.description : orderline.product.display_name + " Description",
                quantity: orderline.quantity,
                unitName: "PC",
                unitPrice: orderline.price,
                taxRate: orderline.product.taxes_id === undefined ? 0 : orderline.product.taxes_id.length > 0 ? this.pos.taxes_by_id[orderline.product.taxes_id[0]].amount : 0,
                discountAmount: orderline.discount,
                discountType: "percentage",
                serviceChargeAmount: orderline.service_charge,
                serviceChargeType: "percentage"
            };
        });

        var forSunmi = {
            orderlines: extractedOrderlines,
            voidedOrderLines: [],
            customer: customer,
            paymentType: "cash",
            paidAmount: receiptData.total_paid,
            qrCode: "",
            change: receiptData.change,
            headerText: receiptData.headerData.header !== false ? receiptData.headerData.header : "",
            footerText: receiptData.footer !== false ? receiptData.footer : "",
            cashier: receiptData.cashier,
            ref: receiptData.name,
            globalServiceChargeType: "Percentage",
            globalServiceChargeAmount: this.pos.config.pos_module_pos_service_charge ? this.pos.config.global_service_charge : 0,
            globalDiscountType: "Percentage",
            globalDiscountAmount: this.pos.config.module_pos_discount ? this.pos.config.discount_pc : 0,
            commercialLogo: ""
        };

        if (window.Android != undefined) {
            if (window.Android.isAndroidPOS()) {

                var result;
                if (isRefundOrder) {
                    result = window.Android.printRefundInvoice(JSON.stringify(forSunmi));
                }
                else {
                    result = window.Android.printSalesInvoice(JSON.stringify(forSunmi));
                }

                var responseObject = JSON.parse(result);
                if (responseObject.success) {

                    let print_data = {
                        success: responseObject.success,
                        is_refund: this.currentOrder.is_refund,
                        order_uid: responseObject.refNo,
                        mrc: responseObject.mrc,
                        checkSum: responseObject.checkSum
                    };

                    if (this.currentOrder.is_refund) {
                        print_data.rfdNo = responseObject.rfdNo;
                    }
                    else {
                        print_data.fsNo = responseObject.fsNo;
                    }
                    this.currentOrder._printed = true;
                    let printData = [print_data]
                    console.log("to save to POS ===> " + JSON.stringify(printData));
                    //this.currentOrder.setFiscalPrinterDate(printData);
                    //await this.setPrintStatus(printData);
                } else {
                    if (responseObject.printedInvoice) {
                        this.env.services.notification.add("Fiscal Printing Failed", {
                            type: 'danger',
                            sticky: false,
                            timeout: 10000,
                        });

                        const { confirmed } = await this.popup.add(ConfirmPopup, {
                            title: _t("Printed Invoice"),
                            body: _t("%s has been printed before. Do you want a non-fiscal reprint?", forSunmi.ref),
                        });
                        if (confirmed) {
                            if (this.currentOrder.is_refund) {
                                result = window.Android.rePrintRefundInvoice(forSunmi.ref);
                            }
                            else {
                                result = window.Android.rePrintSalesInvoice(forSunmi.ref);
                            }
                        }

                    } else {
                        this.currentOrder._printed = false;

                        this.env.services.notification.add(responseObject.message, {
                            type: 'danger',
                            sticky: false,
                            timeout: 10000,
                        });

                    }

                }
                console.log("===========> Response From POS Device");
                console.log("success => " + responseObject.success);
                console.log("message => " + responseObject.message);
                console.log(result);
                return responseObject.success;
            }
        }
        else {
            this.env.services.notification.add("Invalid Device", {
                type: 'danger',
                sticky: false,
                timeout: 10000,
            });
        }

    }
});
