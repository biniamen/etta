/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen";

patch(TicketScreen.prototype, {
    _getToRefundDetail(orderline) {
        let result = super._getToRefundDetail(orderline);
        result.service_charge = orderline.service_charge;
        return result;
    },
    _prepareRefundOrderlineOptions(toRefundDetail) {
        const { qty, orderline } = toRefundDetail;
        const draftPackLotLines = orderline.pack_lot_lines
            ? { modifiedPackLotLines: [], newPackLotLines: orderline.pack_lot_lines }
            : false;

        var res = {
            quantity: -qty,
            price: orderline.price,
            extras: { price_type: "automatic" },
            merge: false,
            refunded_orderline_id: orderline.id,
            tax_ids: orderline.tax_ids,
            discount: orderline.discount,
            service_charge: orderline.service_charge,
            draftPackLotLines: draftPackLotLines,
        };
        return res;
    },
    async onDoRefund() {
        const order = this.getSelectedOrder();

        if (order && this._doesOrderHaveSoleItem(order)) {
            if (!this._prepareAutoRefundOnOrder(order)) {
                // Don't proceed on refund if preparation returned false.
                return;
            }
        }

        if (!order) {
            this._state.ui.highlightHeaderNote = !this._state.ui.highlightHeaderNote;
            return;
        }

        const partner = order.get_partner();

        const allToRefundDetails = this._getRefundableDetails(partner);
        if (allToRefundDetails.length == 0) {
            this._state.ui.highlightHeaderNote = !this._state.ui.highlightHeaderNote;
            return;
        }

        // The order that will contain the refund orderlines.
        // Use the destinationOrder from props if the order to refund has the same
        // partner as the destinationOrder.
        const destinationOrder =
            this.props.destinationOrder &&
            partner === this.props.destinationOrder.get_partner() &&
            !this.pos.doNotAllowRefundAndSales()
                ? this.props.destinationOrder
                : this._getEmptyOrder(partner);

        // Add orderline for each toRefundDetail to the destinationOrder.
        for (const refundDetail of allToRefundDetails) {
            const product = this.pos.db.get_product_by_id(refundDetail.orderline.productId);
            const options = this._prepareRefundOrderlineOptions(refundDetail);
            await destinationOrder.add_product(product, options);
            refundDetail.destinationOrderUid = destinationOrder.uid;
        }

        //Add a check too see if the fiscal position exist in the pos
        if (order.fiscal_position_not_found) {
            this.showPopup("ErrorPopup", {
                title: _t("Fiscal Position not found"),
                body: _t(
                    "The fiscal position used in the original order is not loaded. Make sure it is loaded by adding it in the pos configuration."
                ),
            });
            return;
        }
        destinationOrder.fiscal_position = order.fiscal_position;
        // Set the partner to the destinationOrder.
        this.setPartnerToRefundOrder(partner, destinationOrder);

        if (this.pos.get_order().cid !== destinationOrder.cid) {
            this.pos.set_order(destinationOrder);
        }

        // this.pos.get_order().set_is_refund_order(true);
        this.pos.set_is_refund_order(true);

        this.closeTicketScreen();
    }
});