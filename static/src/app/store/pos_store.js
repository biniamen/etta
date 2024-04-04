/** @odoo-module */
import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";

patch(PosStore.prototype, {
    async setup() {
        this.is_refund = false;
        await super.setup(...arguments);
    },
    is_refund_order() {
        return this.is_refund;
    },
    set_is_refund_order(value) {
        this.is_refund = value;
    },
    async _processData(loadedData) {
        await super._processData(...arguments);
        this.void_reasons = loadedData["void.reason"];
        this.taxes = loadedData["account.tax"];
    }
});