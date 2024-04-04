/** @odoo-module **/
import {registry} from "@web/core/registry";
import { session } from "@web/session";
import { BarcodeParser } from "@barcodes/js/barcode_parser";

/** @odoo-module **/
const PosIDB = (function (exports) {
    'use strict';

    const {get, set, del, keys, clear, Store} = idbKeyval;
    // Here we use custom store in using idbKeyVal. This is to avoid
    // overlap with other service workers that uses the library.
    // This is an added future-proofing to prevent name conflicts
    // when other modules started to introduce service worker with
    // the use of idbkeyval library as well.
    const store = new Store('POS-Cache', 'POS-Cache-Database');

    const PosIDB = {
        get(key) {
            const datas = get(key, store);
            return datas
        },
        set(key, value) {
            return set(key, value, store);
        },
        del(key) {
            return del(key, store);
        },
        keys() {
            return keys(store);
        },
        clear() {
            return clear(store);
        },
        getPos() {
            debugger
        }
    };

    Object.assign(exports, PosIDB);

    return exports;
})({});
export const ServiceWorker = {
    async start(env, deps) {
        const {popup, barcode, orm} = deps;
        if (!('serviceWorker' in navigator)) {
            console.error('====>>>   serviceWorker is not available in your browser. IT NOT POSSIBLE WORK OFFLINE MODE ****');
            alert("SO BAD .................... serviceWorker is not available in your browser")
            return;
        }
        try {
            const registration = await navigator.serviceWorker.register('/pos-service-worker', {scope: '/pos/'});
            await PosIDB.set('stopCaching', false);
            console.warn('====>>> serviceWorker registration successful with scope:', registration.scope);
            console.warn("Great, serviceWorker registration successful with scope")
            if (session.nomenclature_id) {
                await BarcodeParser.fetchNomenclature(
                    env.services.orm,
                    session.nomenclature_id
                );
            }

            if (session.fallback_nomenclature_id && barcodeReader) {
                await BarcodeParser.fetchNomenclature(
                    env.services.orm,
                    session.fallback_nomenclature_id
                );
            }
        } catch (error) {
            console.error('====>>> serviceWorker registration failed.', error);
            alert("serviceWorker registration failed.", error)
        }
    },
};

registry.category("services").add("service_worker", ServiceWorker);
