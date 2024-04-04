/** @odoo-module */

import { Order } from "@point_of_sale/app/store/models";
import { Orderline } from "@point_of_sale/app/store/models";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { VoidReasonPopup } from "../void_reason_popup/void_reason_popup";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";

patch(Order.prototype, {
    setup(_defaultObj, options) {
        super.setup(...arguments);
        this.is_refund = false;
        this.fs_no = "";
        this.rf_no = "";
        this.ej_checksum = "";
        this.fiscal_mrc = "";
    },
    init_from_JSON(json) {
        super.init_from_JSON(json);
        this.set_is_refund_order(json.is_refund);
        this.set_fs_no(json.fs_no);
        this.set_rf_no(json.rf_no);
        this.set_ej_checksum(json.ej_checksum);
        this.set_fiscal_mrc(json.fiscal_mrc);
    },
    export_as_JSON() {
        const jsonResult = super.export_as_JSON();
        jsonResult.is_refund = this.is_refund;
        jsonResult.fs_no = this.fs_no;
        jsonResult.rf_no = this.rf_no;
        jsonResult.ej_checksum = this.ej_checksum;
        jsonResult.fiscal_mrc = this.fiscal_mrc;
        return jsonResult;
    },
    async removeOrderline(line) {
        let changes = Object.values(this.pos.get_order().changesToOrder());
        let found = false;
        let orderedQty = 0;

        if (changes.length != 0) {
            for (let i = 0; i < changes.length; i++) {
                const change = changes[i];
                for (let j = 0; j < change.length; j++) {
                    const element = change[j];
                    if (element.product_id == this.pos.get_order().get_selected_orderline().get_product().id) {
                        orderedQty = element.quantity;
                        found = true;
                        break;
                    }
                }
            }
        }

        if (found) {
            if (this.pos.get_cashier().role === 'manager') {
                const popupResult = await this.env.services.popup.add(VoidReasonPopup, {
                    title: _t("Void Orderline"),
                    orderedQty: orderedQty
                });

                const id = this.pos.get_order().get_selected_orderline().product.id;
                const productName = this.pos.get_order().get_selected_orderline().product.display_name;
                const unitPrice = this.pos.get_order().get_selected_orderline().product.lst_price;
                const quantity = this.pos.get_order().selected_orderline.quantityStr
                const pluCode = this.pos.get_order().get_selected_orderline().product.default_code ? this.pos.get_order().get_selected_orderline().product.default_code : "00007"
                const taxRate = this.pos.get_order().get_selected_orderline().product.tax_id === undefined ? 0 : this.pos.get_order().get_selected_orderline().product.tax_id.length > 0 ? this.pos.taxes_by_id[this.pos.get_order().get_selected_orderline().product.taxes_id[0]].amount : 0

                const dataToStore = {
                    id: id,
                    productName: productName,
                    unitPrice: unitPrice,
                    quantity: quantity,
                    pluCode: pluCode,
                    taxRate: taxRate

                };
                var jsonString = JSON.stringify(dataToStore);
                localStorage.setItem('VOIDED ORDERS', jsonString);
                if (popupResult.confirmed) {
                    super.removeOrderline(line);
                }
                else if (popupResult.error) {
                    this.env.services.notification.add(popupResult.error, {
                        type: 'danger',
                        sticky: false,
                        timeout: 10000,
                    });
                }
            }
            else {
                this.env.services.notification.add("Access Denied", {
                    type: 'danger',
                    sticky: false,
                    timeout: 10000,
                });
            }
        } else {
            super.removeOrderline(line);
        }
    },
    async printChanges(cancelled) {
        const orderChange = this.changesToOrder(cancelled);
        let isPrintSuccessful = true;
        const d = new Date();
        let hours = "" + d.getHours();
        hours = hours.length < 2 ? "0" + hours : hours;
        let minutes = "" + d.getMinutes();
        minutes = minutes.length < 2 ? "0" + minutes : minutes;
        for (const printer of this.pos.unwatched.printers) {
            const changes = this._getPrintingCategoriesChanges(
                printer.config.product_categories_ids,
                orderChange
            );

            let today = new Date();
            let formattedDate = today.getDate().toString().padStart(2, '0') + '/'
                + (today.getMonth() + 1).toString().padStart(2, '0') + '/' // Months are 0-indexed
                + today.getFullYear();

            if (changes["new"].length > 0 || changes["cancelled"].length > 0) {
                const printingChanges = {
                    new: changes["new"],
                    cancelled: changes["cancelled"],
                    table_name: this.pos.config.module_pos_restaurant
                        ? this.getTable().name
                        : false,
                    floor_name: this.pos.config.module_pos_restaurant
                        ? this.getTable().floor.name
                        : false,
                    name: this.name || "unknown order",
                    cashier: this.cashier.name,
                    time: {
                        hours,
                        minutes,
                    },
                    date: formattedDate
                };

                const result = await printer.printReceipt(printingChanges, printer.config);
                if (!result.successful) {
                    isPrintSuccessful = false;
                }
            }
        }

        return isPrintSuccessful;
    },
    isValidArray(array) {
        // Check if the input is an array
        if (!Array.isArray(array)) {
            return false;
        }

        // Initialize variables to track positive and negative values
        let hasPositive = false;
        let hasNegative = false;

        // Iterate through the array and check the "priceWithTax" property
        for (const obj of array) {
            // Check if the object has the "priceWithTax" property
            if (typeof obj.priceWithTax === 'number') {
                if (obj.priceWithTax > 0) {
                    hasPositive = true;
                } else if (obj.priceWithTax < 0) {
                    hasNegative = true;
                }
            }

            // If both positive and negative values are found, return false
            if (hasPositive && hasNegative) {
                return false;
            }
        }

        // If only positive or negative values are found, return true
        return true;
    },
    async pay() {
        let self = this;
        let order = this.pos.get_order();
        let lines = order.get_orderlines();
        let restrict_order = false;
        var product_names = ''

        const pricesArray = lines.map(element => element.get_all_prices());

        if (this.isValidArray(pricesArray)) {
            if (this.pos.get_cashier().role === 'manager') {
                if (order && lines.length > 0) {
                    lines.forEach(function (line) {
                        if (line.get_display_price() == 0.00) {
                            restrict_order = true;
                            product_names += '-' + line.product.display_name + "\n"
                        }
                    });
                }
                else {
                    restrict_order = true;
                }
                if (restrict_order) {
                    if (product_names) {
                        self.env.services.popup.add(ErrorPopup, {
                            'title': _t("Product With 0 Price"),
                            'body': _t('You are not allowed to have the zero prices on the order line . %s', product_names),
                        });
                    }
                    else {
                        self.env.services.popup.add(ErrorPopup, {
                            'title': _t("Empty Order"),
                            'body': _t('There must be at least one product in your order before it can be validated.'),
                        });
                    }
                }
                else {
                    super.pay();
                }
            }
            else {
                this.env.services.notification.add("Access Denied", {
                    type: 'danger',
                    sticky: false,
                    timeout: 10000,
                });
            }
        }
        else {
            self.env.services.popup.add(ErrorPopup, {
                'title': _t("Invalid Order"),
                'body': _t('Can not have positive and negative amount values in a single order'),
            });
        }
    },
    set_orderline_options(orderline, options) {
        super.set_orderline_options(orderline, options);
        if (orderline.product.service_charge !== undefined) {
            orderline.set_service_charge(orderline.product.service_charge);
        }
    },
    is_refund_order() {
        return this.is_refund;
    },
    set_is_refund_order(value) {
        this.is_refund = value;
    },
    get_fs_no() {
        return this.fs_no;
    },
    set_fs_no(value) {
        this.fs_no = value;
    },
    set_rf_no(value) {
        this.rf_no = value;
    },
    get_rf_no() {
        return this.rf_no;
    },
    set_ej_checksum(value) {
        this.ej_checksum = value;
    },
    get_ej_checksum() {
        return this.ej_checksum;
    },
    set_fiscal_mrc(value) {
        this.fiscal_mrc = value;
    },
    get_fiscal_mrc_no() {
        return this.fiscal_mrc;
    },
    async printFiscalReceipt() {
        var receiptData = this.export_for_printing();
        receiptData.tenant = "odoo17";
        receiptData.client = this.get_partner();

        console.log("RECEIPT DATA");
        console.log(receiptData);

        let customer = {};

        if (receiptData.client != null) {
            customer.customerName = receiptData.client.name;
            customer.customerTradeName = "";
            customer.customerTIN = receiptData.client.vat;
            customer.customerPhoneNo = receiptData.client.phone;
        }

        let orderlinesFromOrder = this.orderlines;
        let isRefundOrder = this.pos.is_refund_order();
        this.set_is_refund_order(isRefundOrder);

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

        console.log(this.pos.config);
        console.log("GLOBAL DISCOUNT");
        console.log(this.pos.config.module_pos_discount ? this.pos.config.discount_pc : 0);

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
                    this.set_ej_checksum(responseObject.checkSum);
                    this.set_fiscal_mrc(responseObject.mrc);

                    if (this.is_refund) {
                        this.set_rf_no(responseObject.rfdNo);
                    }
                    else {
                        this.set_fs_no(responseObject.fsNo);
                    }
                    this._printed = true;
                    //console.log("to save to POS ===> " + JSON.stringify(printData));
                    //this.currentOrder.setFiscalPrinterDate(printData);
                    //await this.setPrintStatus(printData);
                } else {
                    this._printed = false;

                    if (responseObject.printedInvoice) {
                        this.env.services.notification.add("Fiscal Printing Failed", {
                            type: 'danger',
                            sticky: false,
                            timeout: 10000,
                        });

                    } else {
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
            else {
                return false;
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

patch(Orderline.prototype, {
    setup(_defaultObj, options) {
        super.setup(...arguments);
        this.pos = options.pos;
        this.service_charge = 0;
        this.service_chargeStr = "";
        if (options.json) {
            this.init_from_JSON(options.json);
        }
    },
    init_from_JSON(json) {
        super.init_from_JSON(json);
        this.set_service_charge(json.service_charge);
    },
    export_as_JSON() {
        const jsonResult = super.export_as_JSON();
        jsonResult.service_charge = this.service_charge;
        return jsonResult;
    },
    clone() {
        const orderlineClone = super.clone();
        orderlineClone.service_charge = this.service_charge;
        return orderlineClone;
    },
    set_service_charge(service_charge) {
        var parsed_service_charge =
            typeof service_charge === "number"
                ? service_charge
                : isNaN(parseFloat(service_charge))
                    ? 0
                    : oParseFloat("" + service_charge);
        var sc = Math.min(Math.max(parsed_service_charge || 0, 0), 100);
        this.service_charge = sc;
        this.service_chargeStr = "" + sc;
    },
    get_all_prices(qty = this.get_quantity()) {
        // console.log("=== this.order.state ===> ", (this.order.state != 'done' || this.order.state != 'paid'));
        var self = this;
        if(!this.order.is_refund && (this.order.state != 'done' || this.order.state != 'paid')){
            if (this.order.pos.config.pos_module_pos_service_charge) {
                this.order.orderlines.forEach(function (line) {
                    line.set_service_charge(self.order.pos.config.global_service_charge);
                });
            }
            if (this.order.pos.config.module_pos_discount) {
                this.order.orderlines.forEach(function (line) {
                    line.set_discount(self.order.pos.config.discount_pc);
                });
            }
        }

        // First, calculate the price unit after discount but before service charge
        var price_unit = this.get_unit_price() * (1.0 - this.get_discount() / 100.0);

        // Apply the service charge to the price unit
        // Assuming service_charge is a percentage of the price unit after discount
        price_unit += price_unit * (this.service_charge / 100.0);

        var taxtotal = 0;
        var product = this.get_product();
        var taxes_ids = this.tax_ids || product.taxes_id;
        taxes_ids = taxes_ids.filter((t) => t in this.pos.taxes_by_id);
        var taxdetail = {};
        var product_taxes = this.pos.get_taxes_after_fp(taxes_ids, this.order.fiscal_position);

        // Compute all taxes based on the adjusted price_unit which includes the service charge
        var all_taxes = this.compute_all(
            product_taxes,
            price_unit,
            qty,
            this.pos.currency.rounding
        );

        // For consistency, we might need to adjust how we present prices before discounts and service charges.
        // This example does not handle that scenario directly but focuses on applying the service charge correctly.
        var all_taxes_before_discount = this.compute_all(
            product_taxes,
            this.get_unit_price(),
            qty,
            this.pos.currency.rounding
        );
        all_taxes.taxes.forEach(function (tax) {
            taxtotal += tax.amount;
            taxdetail[tax.id] = {
                amount: tax.amount,
                base: tax.base,
            };
        });

        return {
            priceWithTax: all_taxes.total_included,
            priceWithoutTax: all_taxes.total_excluded,
            priceWithTaxBeforeDiscount: all_taxes_before_discount.total_included,
            priceWithoutTaxBeforeDiscount: all_taxes_before_discount.total_excluded,
            tax: taxtotal,
            taxDetails: taxdetail,
        };
    },
    get_service_charge() {
        return this.service_charge;
    },
    get_service_chargeStr() {
        return this.service_chargeStr;
    },
    getDisplayData() {
        const displayData = super.getDisplayData();
        displayData.service_charge = this.service_charge;
        return displayData;
    },
});