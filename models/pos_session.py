from odoo import models, api, fields

# In this custom module, we have extended the 'pos.session' model to add additional functionality.
# We have overridden the '_pos_ui_models_to_load' method to include 'void.reason' and 'account.tax' in the models to load.
# We have added '_loader_params_void_reason' and '_get_pos_ui_void_reason' methods to customize the loading of 'void.reason' data.
# We have overridden the '_loader_params_product_product' method to include 'service_charge' in the 'product.product' data.
# We have added '_loader_params_account_tax' and '_get_pos_ui_account_tax' methods to customize the loading of 'account.tax' data.
# In the '_loader_params_account_tax' method, we have specified that the 'type_tax_use' field should be included in the loaded data.
# The '_get_pos_ui_account_tax' method fetches the 'account.tax' data with the specified fields.

class PosSession(models.Model):
    """Model inherited to add additional functionality"""
    _inherit = 'pos.session'

# added from offline module
    def _loader_params_res_company(self):
        result = super()._loader_params_res_company()
        result['search_params']['fields'].extend(
            ['write_date'])
        return result

    def _pos_ui_models_to_load(self):
        """Used to super the _pos_ui_models_to_load"""
        result = super()._pos_ui_models_to_load()
        result += [
            'void.reason'
        ]
        return result

    def _loader_params_void_reason(self):
        """Used to override the default settings for loading fields"""
        return {
            'search_params': {
                'fields': ['reason'],
            },
        }

    def _get_pos_ui_void_reason(self, params):
        """Used to get the parameters"""
        return self.env['void.reason'].search_read(
            **params['search_params'])

    def _loader_params_product_product(self):
        params = super()._loader_params_product_product()
        # this is usefull to evaluate reward domain in frontend
        params['search_params']['fields'].append('service_charge')
        return params
    
    def _loader_params_account_tax(self):
        params = super()._loader_params_account_tax()
        params['search_params']['fields'].append('type_tax_use')
        return params