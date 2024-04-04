from odoo import fields, models, api
import logging

_logger = logging.getLogger(__name__)

class SaleOrder(models.Model):
    _inherit = 'sale.order'
    
    service_charge = fields.Float(string='Service Charge')

class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'
    
    service_charge = fields.Float(string='Service Charge')

class AccountMove(models.Model):
    _inherit = 'account.move'
    
    service_charge = fields.Float(string='Service Charge')

class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'
    
    service_charge = fields.Float(string='Service Charge')

    @api.depends('quantity', 'discount', 'price_unit', 'tax_ids', 'currency_id', 'service_charge')
    def _compute_totals(self):
        for line in self:
            if line.display_type != 'product':
                line.price_total = line.price_subtotal = False
            # Compute 'price_subtotal'.
            line_discount_price_unit = line.price_unit * (1 - (line.discount / 100.0))
            line_service_charge_price_unit = line_discount_price_unit * (1 + (line.service_charge / 100.0))
            subtotal = line.quantity * line_service_charge_price_unit

            # Compute 'price_total'.
            if line.tax_ids:
                taxes_res = line.tax_ids.compute_all(
                    line_discount_price_unit,
                    quantity=line.quantity,
                    currency=line.currency_id,
                    product=line.product_id,
                    partner=line.partner_id,
                    is_refund=line.is_refund,
                )
                line.price_subtotal = taxes_res['total_excluded']
                line.price_total = taxes_res['total_included']
            else:
                line.price_total = line.price_subtotal = subtotal

class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'
    
    service_charge = fields.Float(string='Service Charge')

class PurchaseOrderLine(models.Model):
    _inherit = 'purchase.order.line'
    
    service_charge = fields.Float(string='Service Charge')

class PosOrderInherit(models.Model):
    _inherit = 'pos.order'

    is_refund = fields.Boolean(string="Is Refund", help="Is a Refund Order")
    fs_no = fields.Char('FS No')
    rf_no = fields.Char('RF No')
    ej_checksum = fields.Char('EJ Checksum')
    fiscal_mrc = fields.Char('MRC')

    @api.model
    def _order_fields(self, ui_order):
        vals = super(PosOrderInherit, self)._order_fields(ui_order)
        vals.update({
            'is_refund': ui_order.get('is_refund', False),
            'fs_no': ui_order.get('fs_no', ''),
            'rf_no': ui_order.get('rf_no', ''),
            'ej_checksum': ui_order.get('ej_checksum', ''),
            'fiscal_mrc': ui_order.get('fiscal_mrc', '')
            })
        return vals
    
    @api.onchange('service_charge', 'price_unit', 'tax_ids', 'qty', 'discount', 'product_id')
    def _onchange_amount_line_all(self):
        super(PosOrderInherit, self)._onchange_amount_line_all()

    @api.model
    def _amount_line_tax(self, line, fiscal_position_id):
        super(PosOrderInherit, self)._amount_line_tax()
        price = line.price_unit * (1 + (line.service_charge or 0.0) / 100.0)
        return sum(tax.get('amount', 0.0) for tax in taxes)

    def _prepare_refund_values(self, current_session):
        vals = super(PosOrderInherit, self)._prepare_refund_values(current_session)
        vals.update({'is_refund': True})
        return vals

    def _prepare_tax_base_line_values(self, sign=1):
        """ Convert pos order lines into dictionaries that would be used to compute taxes later.

        :param sign: An optional parameter to force the sign of amounts.
        :return: A list of python dictionaries (see '_convert_to_tax_base_line_dict' in account.tax).
        """
        self.ensure_one()
        commercial_partner = self.partner_id.commercial_partner_id

        base_line_vals_list = []
        for line in self.lines.with_company(self.company_id):
            account = line.product_id._get_product_accounts()['income']
            if not account:
                raise UserError(_(
                    "Please define income account for this product: '%s' (id:%d).",
                    line.product_id.name, line.product_id.id,
                ))

            if self.fiscal_position_id:
                account = self.fiscal_position_id.map_account(account)

            is_refund = line.qty * line.price_unit < 0

            product_name = line.product_id\
                .with_context(lang=line.order_id.partner_id.lang or self.env.user.lang)\
                .get_product_multiline_description_sale()
            base_line_vals_list.append(
                {
                    **self.env['account.tax']._convert_to_tax_base_line_dict(
                        line,
                        partner=commercial_partner,
                        currency=self.currency_id,
                        product=line.product_id,
                        taxes=line.tax_ids_after_fiscal_position,
                        price_unit=line.price_unit,
                        quantity=sign * line.qty,
                        price_subtotal=sign * line.price_subtotal,
                        discount=line.discount,
                        account=account,
                        is_refund=is_refund,
                    ),
                    'uom': line.product_uom_id,
                    'name': product_name,
                    'service_charge': line.service_charge
                }
            )
        _logger.info("PREPARING _prepare_tax_base_line_values")
        return base_line_vals_list

    def _prepare_invoice_lines(self):
        """ Prepare a list of orm commands containing the dictionaries to fill the
        'invoice_line_ids' field when creating an invoice.

        :return: A list of Command.create to fill 'invoice_line_ids' when calling account.move.create.
        """
        _logger.info("PREPARING _prepare_invoice_lines")
        sign = 1 if self.amount_total >= 0 else -1
        line_values_list = self._prepare_tax_base_line_values(sign=sign)
        invoice_lines = []
        for line_values in line_values_list:
            _logger.info(">>>>>>>>>>>>>>>>>>>>>>>>>> line_values service_charge <<<<<<<<<<<<<<<<<<<<<<<<<<")
            _logger.info(line_values['service_charge'])
            line = line_values['record']
            invoice_lines.append((0, None, {
                'product_id': line_values['product'].id,
                'quantity': line_values['quantity'],
                'discount': line_values['discount'],
                'service_charge': line_values['service_charge'],
                'price_unit': line_values['price_unit'],
                'name': line_values['name'],
                'tax_ids': [(6, 0, line_values['taxes'].ids)],
                'product_uom_id': line_values['uom'].id,
            }))
            if line.order_id.pricelist_id.discount_policy == 'without_discount' and float_compare(line.price_unit, line.product_id.lst_price, precision_rounding=self.currency_id.rounding) < 0:
                invoice_lines.append((0, None, {
                    'name': _('Price discount from %s -> %s',
                              float_repr(line.product_id.lst_price, self.currency_id.decimal_places),
                              float_repr(line.price_unit, self.currency_id.decimal_places)),
                    'display_type': 'line_note',
                }))
            if line.customer_note:
                invoice_lines.append((0, None, {
                    'name': line.customer_note,
                    'display_type': 'line_note',
                }))

        return invoice_lines

class PosOrderLineInherit(models.Model):
    _inherit = 'pos.order.line'

    service_charge = fields.Float(string='Service Charge (%)', digits=0, default=0.0)

    @api.onchange('service_charge', 'price_unit', 'tax_ids', 'qty', 'discount', 'product_id')
    def _onchange_amount_line_all(self):
        super(PosOrderLineInherit, self)._onchange_amount_line_all()

    def _compute_amount_line_all(self):
        self.ensure_one()
        fpos = self.order_id.fiscal_position_id
        tax_ids_after_fiscal_position = fpos.map_tax(self.tax_ids)
        
        # Apply discount
        price_after_discount = self.price_unit * (1 - (self.discount or 0.0) / 100.0)
        
        # Assuming 'service_charge' is a field on the line representing a percentage
        # Apply service charge
        price_after_service_charge = price_after_discount * (1 + (self.service_charge or 0.0) / 100.0)
        
        taxes = tax_ids_after_fiscal_position.compute_all(price_after_service_charge, self.order_id.currency_id, self.qty, product=self.product_id, partner=self.order_id.partner_id)
        
        return {
            'price_subtotal_incl': taxes['total_included'],
            'price_subtotal': taxes['total_excluded'],
        }

    @api.onchange('qty', 'discount', 'price_unit', 'tax_ids', 'service_charge')
    def _onchange_qty(self):
        if self.product_id:
            # Calculate the price after applying the discount
            price_after_discount = self.price_unit * (1 - (self.discount or 0.0) / 100.0)
            # Apply the service charge to the discounted price
            price_after_service_charge = price_after_discount * (1 + (self.service_charge or 0.0) / 100.0)

            # Calculate the subtotal based on the price after applying both discount and service charge
            self.price_subtotal = self.price_subtotal_incl = price_after_service_charge * self.qty

            if self.tax_ids:
                taxes = self.tax_ids.compute_all(price_after_service_charge, self.order_id.currency_id, self.qty, product=self.product_id, partner=False)
                self.price_subtotal = taxes['total_excluded']
                self.price_subtotal_incl = taxes['total_included']

    def _export_for_ui(self, orderline):
        return {
            'id': orderline.id,
            'qty': orderline.qty,
            'attribute_value_ids': orderline.attribute_value_ids.ids,
            'custom_attribute_value_ids': orderline.custom_attribute_value_ids.read(['id', 'name', 'custom_product_template_attribute_value_id', 'custom_value'], load=False),
            'price_unit': orderline.price_unit,
            'skip_change': orderline.skip_change,
            'uuid': orderline.uuid,
            'price_subtotal': orderline.price_subtotal,
            'price_subtotal_incl': orderline.price_subtotal_incl,
            'product_id': orderline.product_id.id,
            'discount': orderline.discount,
            'tax_ids': [[6, False, orderline.tax_ids.mapped(lambda tax: tax.id)]],
            'pack_lot_ids': [[0, 0, lot] for lot in orderline.pack_lot_ids.export_for_ui()],
            'customer_note': orderline.customer_note,
            'refunded_qty': orderline.refunded_qty,
            'price_extra': orderline.price_extra,
            'full_product_name': orderline.full_product_name,
            'refunded_orderline_id': orderline.refunded_orderline_id.id,
            'combo_parent_id': orderline.combo_parent_id.id,
            'combo_line_ids': orderline.combo_line_ids.mapped('id'),
            'service_charge': orderline.service_charge,  # Add the service charge here
        }
