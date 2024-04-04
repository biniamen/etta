from odoo import fields, models

import logging

_logger = logging.getLogger(__name__)

class PosConfig(models.Model):
    _inherit = 'pos.config'
    disable_remove_order_line_basic_right = fields.Boolean(
        string="Disable Removal of Order Line for Basic Rights Users",
        help="If enabled, users with basic rights cannot remove order lines."
    )
    global_service_charge = fields.Float("Global Service charge")
    pos_module_pos_service_charge = fields.Boolean("Global Service charge")