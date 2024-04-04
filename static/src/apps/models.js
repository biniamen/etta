/** @odoo-module **/
import {PosStore} from "@point_of_sale/app/store/pos_store";
import {patch} from "@web/core/utils/patch";

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

patch(PosStore.prototype, {

    async _loadPictures() {
        this.company_logo = new Image();
        return new Promise((resolve, reject) => {
            this.company_logo.onload = () => {
                let img = this.company_logo;
                let ratio = 1;
                let targetwidth = 300;
                let maxheight = 150;
                if (img.width !== targetwidth) {
                    ratio = targetwidth / img.width;
                }
                if (img.height * ratio > maxheight) {
                    ratio = maxheight / img.height;
                }
                let width = Math.floor(img.width * ratio);
                let height = Math.floor(img.height * ratio);
                let c = document.createElement('canvas');
                c.width = width;
                c.height = height;
                let ctx = c.getContext('2d');
                ctx.drawImage(this.company_logo, 0, 0, width, height);

                this.company_logo_base64 = c.toDataURL();
                resolve();
            };
            this.company_logo.onerror = () => {
                reject();
            };
            this.company_logo.crossOrigin = "anonymous";
            this.company_logo.src = '/web/binary/company_logo' + '?dbname=' + this.env.session.db + '&company=' + this.company.id + '&write_date=' + this.company.write_date;
        });
    },

    // async _registerServiceWorker () {
    //     if (!("serviceWorker" in navigator)) {
    //         return;
    //     }
    //     var scope = '/pos/';
    //     return await navigator.serviceWorker
    //         .register("/pos-service-worker", {scope: scope})
    //         .catch(function (error) {
    //             console.error("Service worker registration failed, error:", error);
    //         });
    // },

    async load_server_data() {
        // await this._registerServiceWorker()
        if (!(await this._allowCaching())) {
            await this._invalidateCaches();
        } else {
            // We keep track of the pos_session_id.
            // If the newly opened pos.session differs from the previously used pos.session,
            // we invalidate the cache. This makes sure that the indexeddb cache is regularly cleared.
            if (await PosIDB.get('pos_session_id') !== odoo.pos_session_id) {
                await this._invalidateCaches();
                await PosIDB.set('pos_session_id', odoo.pos_session_id);
            }
        }
        await PosIDB.set('stopCaching', false);
        // We make sure to stop the caching of POST request when server data is loaded.
        return await super.load_server_data()
    },

    async after_load_server_data() {
        let res = await super.after_load_server_data()
        setTimeout(async () => {
            await PosIDB.set('stopCaching', true)
        }, 5000)
        return res
    },


    async _allowCaching() {
        const swRegistration = ('serviceWorker' in navigator && (await navigator.serviceWorker.getRegistration('/pos/'))) || false;
        return (swRegistration && swRegistration.active && swRegistration.active.state === 'activated');
    },

    /**
     * Clear both the IndexedDB and CacheStorage used in caching.
     */
    async _invalidateCaches() {
        await PosIDB.clear();
        try {
            // It is possible that there is no serviceWorker.
            // If that's the case, using `caches` will result to `ReferenceError`.
            await caches.delete('POS-ASSETS');
        } catch (error) {
            console.warn(error);
        }
    }
})

