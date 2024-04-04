from odoo import models, fields

class ProductTemplate(models.Model):
    _inherit = 'product.template'

    service_charge = fields.Float(string='Service Charge')
    default_code = fields.Char(
        'Internal Reference', compute='_compute_default_code',
        inverse='_set_default_code', store=True, required=True)
