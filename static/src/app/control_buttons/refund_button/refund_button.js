/** @odoo-module */

import { useService } from "@web/core/utils/hooks";
import { useState } from "@odoo/owl";
import { patch } from "@web/core/utils/patch";
import { RefundButton } from "@point_of_sale/app/screens/product_screen/control_buttons/refund_button/refund_button";
import { usePos } from "@point_of_sale/app/store/pos_hook";

patch(RefundButton.prototype, {
    setup() {
        super.setup();
        this.pos = usePos();
    },
    async click() {
        if (this.pos.get_cashier().role !== 'manager') {
            this.showErrorMessage("Restricted Access. Please Contact Supervisor.");
            return; // Do nothing if button is disabled
        }
        //Create a Beep Sound from Device
        await super.click();
    },
    async showErrorMessage(msg) {
        this.env.services.notification.add(msg, {
            type: 'danger',
            sticky: false,
            timeout: 10000,
        });
    }
});