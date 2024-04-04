from odoo import fields, models

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    disable_remove_order_line_basic_right = fields.Boolean(
        string="Disable Basic Right Users for Remove Order Line",
        help="Disable users with basic rights to remove order lines in POS.",
        config_parameter='pos_config.disable_remove_order_line_basic_right',
    )
    global_service_charge =  fields.Float(related='pos_config_id.global_service_charge', readonly=False)
    pos_module_pos_service_charge = fields.Boolean(related='pos_config_id.pos_module_pos_service_charge', readonly=False)
