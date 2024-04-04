# -*- coding: utf-8 -*-
{
    "name": "POS Fiscal ETTA",
    "summary": "Module for handeling fiscal printing with SUNMI devices",
    "author": "Melkam Zeyede",
    "version": "0.1",
    "depends": ["base", "point_of_sale"],
    'data': [
        'views/pos_order_view.xml',
        'views/product_template_view_extension.xml',
        'views/pos_order_report_view.xml',
        'views/account_move_line.xml',
        'security/ir.model.access.csv',
        'import_libraries.xml',
    ],
    "assets": {
        'point_of_sale._assets_pos': [
            'pos_etta/static/src/app/**/*',
            "pos_etta/static/src/apps/idb-keyval.js",
            "pos_etta/static/src/apps/PosIDB.js",
            "pos_etta/static/src/apps/models.js",
            "pos_etta/static/src/apps/webClient.js",
        ],
        'point_of_sale.assets': [
            'pos_etta/static/src/app/control_button/*',
        ],
    },
    "installable": True,
    "application": True,
    'license': 'LGPL-3',
}