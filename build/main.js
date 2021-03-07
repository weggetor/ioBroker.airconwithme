"use strict";
/*
 * Created with @iobroker/create-adapter v1.31.0
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = __importStar(require("@iobroker/adapter-core"));
const axios_1 = __importDefault(require("axios"));
// Load your modules here, e.g.:
// import * as fs from "fs";
class Airconwithme extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: 'airconwithme',
        });
        this.baseUrl = '';
        this.infoInterval = null;
        this.infoMetadata = [
            { name: 'wlanSTAMAC', type: 'string', role: 'state', caption: 'Device Client MAC Address' },
            { name: 'wlanAPMAC', type: 'string', role: 'state', caption: 'Device Access Point MAC Address' },
            { name: 'ownSSID', type: 'string', role: 'state', caption: 'Device Access Point SSID' },
            { name: 'fwVersion', type: 'string', role: 'state', caption: 'Device Firmware Version' },
            { name: 'wlanFwVersion', type: 'string', role: 'state', caption: 'Wireless Firmware Version' },
            { name: 'acStatus', type: 'number', role: 'state', caption: 'Air Conditioner Communication Status' },
            { name: 'wlanLNK', type: 'number', role: 'state', caption: 'Connection Status with Wireless Network' },
            { name: 'ssid', type: 'string', role: 'state', caption: 'Wireless Network SSID' },
            { name: 'rssi', type: 'number', role: 'value.rssi', caption: 'Wireless Signal Strength' },
            { name: 'tcpServerLNK', type: 'number', role: 'state', caption: 'Cloud Server Connection' },
            { name: 'localdatetime', type: 'string', role: 'state', caption: 'Local Datetime' },
            { name: 'powerStatus', type: 'number', role: 'state', caption: 'Power Status' },
            { name: 'wifiTxPower', type: 'number', role: 'state', caption: 'Wifi Transfer Power' },
            { name: 'lastconfigdatetime', type: 'number', role: 'state', caption: 'Last Config Datetime' },
            { name: 'deviceModel', type: 'string', role: 'state', caption: 'Device Model' },
            { name: 'sn', type: 'string', role: 'state', caption: 'Serial number' },
            { name: 'lastError', type: 'number', role: 'state', caption: 'Last Error' }
        ];
        this.dpMetadata = [
            { uid: 1, name: 'on', caption: 'On / Off', states: '0:Off;1:On', type: 1 },
            { uid: 2, name: 'userMode', caption: 'User Mode', states: '0:Auto;1:Heat;2:Dry;3:Fan;4:Cool', type: 1 },
            { uid: 4, name: 'fanSpeed', caption: 'Fan Speed', states: '1:Speed 1;2:Speed 2;3:Speed 3;4:Speed 4', type: 1 },
            { uid: 5, name: 'position', caption: 'Vane Up/Down Position', states: '1:Position 1;2:Position 2;3:Position 3;4:Position 4;10:Swing', type: 1 },
            { uid: 9, name: 'userSetpoint', caption: 'User Setpoint', type: 2 },
            { uid: 10, name: 'returnPathTemp', caption: 'Return Path Temperature', type: 2 },
            { uid: 12, name: 'remoteDisable', caption: 'Remote Disable', states: '0:Enable;1:Disable', type: 1 },
            { uid: 13, name: 'onTime', caption: 'On Time', type: 0 },
            { uid: 14, name: 'alarmStatus', caption: 'Alarm Status', states: '0:Off;1:On', type: 1 },
            { uid: 15, name: 'errorCode', caption: 'Error Code', type: 3 },
            { uid: 35, name: 'minTemperature', caption: 'Min Temperature Setpoint', type: 2 },
            { uid: 36, name: 'maxTemperature', caption: 'Max Temperature Setpoint', type: 2 },
            { uid: 37, name: 'outdoorTemperature', caption: 'Outdoor Temperature', type: 2 },
            { uid: 181, name: 'maintenanceTime', caption: 'Maintenance time (h)', type: 0 },
            { uid: 182, name: 'maintenanceConfig', caption: 'Maintenance config (h)', type: 0 },
            { uid: 183, name: 'maintenanceFilterTime', caption: 'Maintenance Filter time (h)', type: 0 },
            { uid: 184, name: 'maintenanceFilterConfig', caption: 'Maintenance Filter config (h)', type: 0 }
        ];
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here
        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        this.log.info('config ipaddress: ' + this.config.ipaddress);
        this.log.info('config username: ' + this.config.username);
        this.log.info('config password: ' + this.config.password);
        this.baseUrl = 'http://' + this.config.ipaddress + '/api.cgi';
        /*
        For every state in the system there has to be also an object of type state
        */
        await this.setObjectNotExistsAsync('reachable', {
            type: 'state',
            common: {
                name: 'reachable',
                type: 'boolean',
                role: 'indicator.reachable',
                read: true,
                write: false
            },
            native: {},
        });
        for (const infoProp of this.infoMetadata) {
            await this.setObjectNotExistsAsync('info.' + infoProp.name, {
                type: 'state',
                common: {
                    name: infoProp.caption,
                    type: (infoProp.type === 'string' ? 'string' : 'number'),
                    role: infoProp.role,
                    read: true,
                    write: false
                },
                native: {},
            });
        }
        // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
        this.readInformation();
        this.subscribeStates('on');
        this.subscribeStates('userMode');
        this.subscribeStates('fanSpeed');
        this.subscribeStates('position');
        this.subscribeStates('userSetpoint');
        this.subscribeStates('remoteDisable');
        // You can also add a subscription for multiple states. The following line watches all states starting with "lights."
        // this.subscribeStates('lights.*');
        // Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
        // this.subscribeStates('*');
        /*
            setState examples
            you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
        */
        // the variable testVariable is set to true as command (ack=false)
        //await this.setStateAsync('info.wlanSTAMAC', 'CC:3F:1D:02:49:94');
        // same thing, but the value is flagged "ack"
        // ack should be always set to true if the value is received from or acknowledged from the target system
        // await this.setStateAsync('testVariable', { val: true, ack: true });
        // same thing, but the state is deleted after 30s (getState will return null afterwards)
        // await this.setStateAsync('testVariable', { val: true, ack: true, expire: 30 });
        this.infoInterval = setInterval(async () => {
            this.readInformation();
        }, 60000);
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            clearInterval(this.infoInterval);
            callback();
        }
        catch (e) {
            callback();
        }
    }
    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  */
    // private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
    //     if (obj) {
    //         // The object was changed
    //         this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    //     } else {
    //         // The object was deleted
    //         this.log.info(`object ${id} deleted`);
    //     }
    // }
    /**
     * Is called if a subscribed state changes
     */
    onStateChange(id, state) {
        // this.subscribeStates('on');
        // this.subscribeStates('userMode');
        // this.subscribeStates('fanSpeed');
        // this.subscribeStates('position');
        // this.subscribeStates('userSetpoint');
        // this.subscribeStates('remoteDisable');
        if (state && !state.ack) {
            const adapterId = id.replace(this.namespace + '.', '');
            this.sendInformation(adapterId, state.val);
            this.log.info(`state ${id} changed: ${JSON.stringify(state)}`);
        }
        else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }
    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  */
    // private onMessage(obj: ioBroker.Message): void {
    //     if (typeof obj === 'object' && obj.message) {
    //         if (obj.command === 'send') {
    //             // e.g. send email or pushover or whatever
    //             this.log.info('send command');
    //             // Send response in callback if required
    //             if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
    //         }
    //     }
    // }
    // eslint-disable-next-line @typescript-eslint/ban-types
    async sendAircon(cmd) {
        try {
            const resp = await axios_1.default.post(this.baseUrl, cmd);
            return resp.data;
        }
        catch (err) {
            this.log.error(err);
            return null;
        }
    }
    async readInformation() {
        var _a, _b, _c;
        let response = await this.sendAircon({ command: 'login', data: { username: 'admin', password: 'admin' } });
        let sessionID = '';
        if (response && response.success) {
            sessionID = response.data.id.sessionID;
            this.log.debug('SessionID ist: ' + sessionID);
            await this.setStateAsync('reachable', { val: true, ack: true });
        }
        else {
            this.log.error('Login fehlgeschlagen !');
            await this.setStateAsync('reachable', { val: false, ack: true });
            return;
        }
        response = await this.sendAircon({ command: 'getinfo', data: { 'sessionID': sessionID } });
        if (response && response.success) {
            const infoData = response.data.info;
            this.log.debug('infodata ist: ' + JSON.stringify(infoData));
            for (const infoProp of Object.keys(infoData)) {
                const val = infoData[infoProp];
                await this.setStateAsync('info.' + infoProp, { val: val, ack: true });
            }
        }
        else {
            await this.setStateAsync('reachable', { val: false, ack: true });
            this.log.error('GetInfo fehlgeschlagen !');
            return;
        }
        response = await this.sendAircon({ command: 'getavailabledatapoints', data: { sessionID: sessionID, uid: 'all' } });
        if (response && response.success) {
            const availableDatapoints = response.data.dp.datapoints;
            for (const dp of availableDatapoints) {
                const dpMeta = this.dpMetadata.find((t) => t.uid === dp.uid);
                if (dpMeta !== null) {
                    const dpObj = {};
                    dpObj.type = 'state';
                    dpObj.common = {};
                    dpObj.native = {};
                    dpObj.common.name = dpMeta === null || dpMeta === void 0 ? void 0 : dpMeta.caption;
                    dpObj.common.type = 'number';
                    dpObj.common.role = 'state';
                    if (dp.type == 2) {
                        dpObj.common.role = 'value.temperature';
                        dpObj.common.unit = '°C';
                    }
                    dpObj.common.read = dp.rw.includes('r');
                    dpObj.common.write = dp.rw.includes('w');
                    if (dpMeta === null || dpMeta === void 0 ? void 0 : dpMeta.states) {
                        dpObj.common.states = dpMeta.states;
                    }
                    if ((_a = dp.descr) === null || _a === void 0 ? void 0 : _a.minValue) {
                        dpObj.common.min = dp.descr.minValue / 10;
                    }
                    if ((_b = dp.descr) === null || _b === void 0 ? void 0 : _b.maxValue) {
                        dpObj.common.max = dp.descr.maxValue / 10;
                    }
                    const id = (_c = dpMeta === null || dpMeta === void 0 ? void 0 : dpMeta.name) !== null && _c !== void 0 ? _c : dp.uid.toString();
                    await this.setObjectNotExistsAsync(id, dpObj);
                }
            }
        }
        else {
            await this.setStateAsync('reachable', { val: false, ack: true });
            this.log.error('GetAvailableDatapoints fehlgeschlagen !');
            return;
        }
        response = await this.sendAircon({ command: 'getdatapointvalue', data: { sessionID: sessionID, uid: 'all' } });
        if (response && response.success) {
            const datapointValues = response.data.dpval;
            for (const dpv of datapointValues) {
                const dpMeta = this.dpMetadata.find((t) => t.uid === dpv.uid);
                let value = dpv.value;
                if (dpMeta) {
                    if ((dpMeta === null || dpMeta === void 0 ? void 0 : dpMeta.type) === 2) {
                        value = value / 10;
                    }
                    await this.setStateAsync(dpMeta.name, { val: value, ack: true });
                }
            }
        }
        else {
            await this.setStateAsync('reachable', { val: false, ack: true });
            console.log('Getdatapointvalues fehlgeschlagen !');
            return;
        }
        await this.sendAircon({ command: 'logout', data: { sessionID: sessionID } });
    }
    async sendInformation(id, value) {
        let response = await this.sendAircon({ command: 'login', data: { username: 'admin', password: 'admin' } });
        let sessionID = '';
        if (response && response.success) {
            sessionID = response.data.id.sessionID;
        }
        else {
            this.log.error('Login fehlgeschlagen !');
        }
        const dpMeta = this.dpMetadata.find((t) => t.name === id);
        if (dpMeta) {
            let translatedVal = value;
            if (dpMeta.type === 2) {
                translatedVal = translatedVal * 10;
            }
            response = await this.sendAircon({ command: 'setdatapointvalue', data: { sessionID: sessionID, uid: dpMeta.uid, value: translatedVal } });
            if (response && response.success) {
                await this.setStateAsync(id, { val: value, ack: true });
            }
            else {
                this.log.error('SetDataPoint fehlgeschlagen !');
            }
        }
        await this.sendAircon({ command: 'logout', data: { sessionID: sessionID } });
    }
}
if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options) => new Airconwithme(options);
}
else {
    // otherwise start the instance directly
    (() => new Airconwithme())();
}
