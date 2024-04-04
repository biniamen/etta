# This Source Codes created by TL Technology (thanhchatvn@gmail.com)
# Not allow resale, editing source codes
# License: Odoo Proprietary License v1.0
# -*- coding: utf-8 -*
from odoo.http import request
from odoo.addons.point_of_sale.controllers.main import PosController
import json
import werkzeug.utils
from odoo.osv.expression import AND
from odoo import api, fields, models, _
from odoo import http, _
from odoo.tools import convert, ustr
from odoo.modules.module import get_module_resource
from odoo.addons.http_routing.models.ir_http import url_for
from odoo.tools import DEFAULT_SERVER_DATETIME_FORMAT

from passlib.context import CryptContext

crypt_context = CryptContext(schemes=['pbkdf2_sha512', 'plaintext'], deprecated=['plaintext'])

import logging

_logger = logging.getLogger(__name__)


class pos_controller(PosController):

    @http.route('/pos-service-worker', type='http', auth='user', methods=['GET'], sitemap=False)
    def service_worker(self):
        sw_file = get_module_resource('pos_etta', 'static/src/worker/pos-service-worker.js')
        with open(sw_file, 'rb') as fp:
            body = fp.read()
        response = request.make_response(body, [
            ('Content-Type', 'text/javascript'),
            ('Service-Worker-Allowed', url_for('/pos/')),
        ])
        return response

    @http.route('/pos/manifest.webmanifest', type='http', auth='user', methods=['GET'], sitemap=False)
    def webmanifest(self):
        manifest = {
            'name': 'Point of Sale',
            'short_name': 'POS',
            'description': 'User-friendly PoS interface for shops and restaurants',
            'scope': url_for('/pos/'),
            'display': 'standalone',
            'background_color': '#ffffff',
            'theme_color': '#875A7B',
        }
        icon_sizes = ['48', '72', '96', '144', '512']
        manifest['icons'] = [{
            'src': f'/point_of_sale/static/description/icon-{size}.png',
            'sizes': f'{size}x{size}',
            'type': 'image/png',
        } for size in icon_sizes]
        body = json.dumps(manifest, default=ustr)
        response = request.make_response(body, [
            ('Content-Type', 'application/manifest+json'),
        ])
        return response
