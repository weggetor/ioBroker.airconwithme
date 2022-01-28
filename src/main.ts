import * as utils from '@iobroker/adapter-core';
import axios from 'axios';


class Airconwithme extends utils.Adapter {

    private baseUrl = '';
    private awmInfoInterval:any = null;
    private awmInfoMetadata = [
        {name: 'wlanSTAMAC', type: 'string', role:'state', caption: 'Device Client MAC Address'},
        {name: 'wlanAPMAC', type: 'string', role:'state', caption: 'Device Access Point MAC Address'},
        {name: 'ownSSID', type: 'string', role:'state', caption: 'Device Access Point SSID'},
        {name: 'fwVersion', type: 'string', role:'state', caption: 'Device Firmware Version'},
        {name: 'wlanFwVersion', type: 'string', role:'state', caption: 'Wireless Firmware Version'},
        {name: 'acStatus', type: 'number', role:'state', caption: 'Air Conditioner Communication Status'},
        {name: 'wlanLNK', type: 'number', role:'state', caption: 'Connection Status with Wireless Network'},
        {name: 'ssid', type: 'string', role:'state', caption: 'Wireless Network SSID'},
        {name: 'rssi', type: 'number', role:'value.rssi', caption: 'Wireless Signal Strength'},
        {name: 'tcpServerLNK', type: 'number', role:'state', caption: 'Cloud Server Connection'},
        {name: 'localdatetime', type: 'string', role:'state', caption: 'Local Datetime'},
        {name: 'powerStatus', type: 'number', role:'state', caption: 'Power Status'},
        {name: 'wifiTxPower', type: 'number', role:'state', caption: 'Wifi Transfer Power'},
        {name: 'lastconfigdatetime', type: 'number', role:'state', caption: 'Last Config Datetime'},
        {name: 'deviceModel', type: 'string', role:'state', caption: 'Device Model'},
        {name: 'sn', type: 'string', role:'state', caption: 'Serial number'},
        {name: 'lastError', type: 'number', role:'state', caption: 'Last Error'}
    ]

    private awnDpMetadata = [
        {uid: 1, name: 'on', caption: 'On / Off', states: '0:Off;1:On', type: 1},
        {uid: 2, name: 'userMode', caption: 'User Mode', states: '0:Auto;1:Heat;2:Dry;3:Fan;4:Cool', type: 1},
        {uid: 4, name: 'fanSpeed', caption: 'Fan Speed', states: '1:Speed 1;2:Speed 2;3:Speed 3;4:Speed 4', type: 1},
        {uid: 5, name: 'position', caption: 'Vane Up/Down Position', states: '1:Position 1;2:Position 2;3:Position 3;4:Position 4;10:Swing', type: 1},
        {uid: 9, name: 'userSetpoint', caption: 'User Setpoint', type: 2},
        {uid: 10, name: 'returnPathTemp', caption: 'Return Path Temperature', type: 2},
        {uid: 12, name: 'remoteDisable', caption: 'Remote Disable', states: '0:Enable;1:Disable', type: 1},
        {uid: 13, name: 'onTime', caption: 'On Time', type: 0},
        {uid: 14, name: 'alarmStatus', caption: 'Alarm Status', states: '0:Off;1:On', type: 1},
        {uid: 15, name: 'errorCode', caption: 'Error Code', type: 3},
        {uid: 35, name: 'minTemperature', caption: 'Min Temperature Setpoint', type: 2},
        {uid: 36, name: 'maxTemperature', caption: 'Max Temperature Setpoint', type: 2},
        {uid: 37, name: 'outdoorTemperature', caption: 'Outdoor Temperature', type: 2},
        {uid: 181, name: 'maintenanceTime', caption: 'Maintenance time (h)', type: 0},
        {uid: 182, name: 'maintenanceConfig', caption: 'Maintenance config (h)', type: 0},
        {uid: 183, name: 'maintenanceFilterTime', caption: 'Maintenance Filter time (h)', type: 0},
        {uid: 184, name: 'maintenanceFilterConfig', caption: 'Maintenance Filter config (h)', type: 0}
    ];

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'airconwithme',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {

        this.log.info('config ipaddress: ' + this.config.ipaddress);
        this.baseUrl = 'http://' + this.config.ipaddress + '/api.cgi';

        // We need a datapoint for reachability of our aircondition
        await this.setObjectNotExistsAsync('reachable', {
            type: 'state',
            common: {
                name: 'reachable',
                type: 'boolean',
                role: 'indicator.reachable',
                read:  true,
                write: false
            },
            native: {},
        });

        // Now we create all informational datapoints of the aircon
        for (const infoProp of this.awmInfoMetadata) {
            await this.setObjectNotExistsAsync('info.' + infoProp.name, {
                type: 'state',
                common: {
                    name: infoProp.caption,
                    type: (infoProp.type === 'string' ? 'string' : 'number'),
                    role: infoProp.role,
                    read:  true,
                    write: false
                },
                native: {},
            });
        }

        // Now we read all available informations from the aircon (incl. creating other datapoints like set Temperatur etc.) and setting the values
        this.awnReadInformation();

        // We subscribe on these datapoints to let them change by user interaction
        this.subscribeStates('on');
        this.subscribeStates('userMode');
        this.subscribeStates('fanSpeed');
        this.subscribeStates('position');
        this.subscribeStates('userSetpoint');
        this.subscribeStates('remoteDisable');


        // Now we refresh our values every 60 seconds
        this.awmInfoInterval = setInterval(async () => {
            this.awnReadInformation();
        }, 60000);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload(callback: () => void): void {
        try {
            clearInterval(this.awmInfoInterval);
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     */
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {

        // When the value changes and aks ist false - it is a user interaction. We need to send the change to the aircon!
        if (state && !state.ack) {
            const adapterId = id.replace (this.namespace + '.','');
            this.awmSendInformation(adapterId, state.val)
            this.log.info(`state '${id}' new value: ${state.val}`);
        }
    }

    // eslint-disable-next-line @typescript-eslint/ban-types
    private async sendAircon(cmd: any): Promise<any | null> {
        try {
            const resp = await axios.post(this.baseUrl, cmd);
            return resp.data;
        } catch (err:any) {
            this.log.error(err);
            return null;
        }
    }

    private async awnReadInformation(): Promise<void> {
        let response = await this.sendAircon({command: 'login', data: {username: this.config.username, password: this.config.password}});
        let sessionID = ''
        if (response && response.success) {
            sessionID = response.data.id.sessionID;
            this.log.debug('SessionID ist: ' + sessionID);
            await this.setStateAsync('reachable', { val: true, ack: true });
        } else {
            this.log.error('Login fehlgeschlagen !');
            await this.setStateAsync('reachable', { val: false, ack: true });
            return;
        }

        response = await this.sendAircon({command:'getinfo', data:{'sessionID':sessionID}});
        if (response && response.success) {
            const infoData = response.data.info;
            this.log.debug('infodata ist: ' + JSON.stringify(infoData));
            for (const infoProp of Object.keys(infoData)) {
                const val = infoData[infoProp]
                await this.setStateAsync('info.' + infoProp, { val: val, ack: true });
            }
        } else {
            await this.setStateAsync('reachable', { val: false, ack: true });
            this.log.error('GetInfo fehlgeschlagen !');
            return;
        }

        response = await this.sendAircon({command:'getavailabledatapoints', data:{sessionID:sessionID, uid:'all'}});
        if (response && response.success) {
            const availableDatapoints = response.data.dp.datapoints;
            for (const dp of availableDatapoints) {
                const dpMeta = this.awnDpMetadata.find((t: { uid: number; }) => t.uid === dp.uid)
                if (dpMeta !== null) {
                    const dpObj: any = {};
                    dpObj.type= 'state';
                    dpObj.common = {};
                    dpObj.native = {};
                    dpObj.common.name = dpMeta?.caption;
                    dpObj.common.type = 'number';
                    dpObj.common.role = 'state';
                    if (dp.type == 2) {
                        dpObj.common.role = 'value.temperature';
                        dpObj.common.unit = '°C';
                    }
                    dpObj.common.read = dp.rw.includes('r');
                    dpObj.common.write = dp.rw.includes('w');
                    if (dpMeta?.states) {
                        dpObj.common.states = dpMeta.states;
                    }
                    if (dp.descr?.minValue) {
                        dpObj.common.min = dp.descr.minValue / 10;
                    }
                    if (dp.descr?.maxValue) {
                        dpObj.common.max = dp.descr.maxValue / 10;
                    }
                    const id = dpMeta?.name ?? dp.uid.toString() ;
                    await this.setObjectNotExistsAsync(id, dpObj);
                }
            }

        } else {
            await this.setStateAsync('reachable', { val: false, ack: true });
            this.log.error('GetAvailableDatapoints fehlgeschlagen !');
            return;
        }

        response = await this.sendAircon({command:'getdatapointvalue', data:{sessionID:sessionID, uid:'all'}});
        if (response && response.success) {
            const datapointValues = response.data.dpval;
            for (const dpv of datapointValues) {
                const dpMeta = this.awnDpMetadata.find((t: { uid: number; }) => t.uid === dpv.uid)
                let value = dpv.value;
                if (dpMeta) {
                    if (dpMeta?.type === 2) {
                        value = value / 10;
                    }
                    await this.setStateAsync(dpMeta.name, { val: value, ack: true });
                }
            }
        } else {
            await this.setStateAsync('reachable', { val: false, ack: true });
            console.log('Getdatapointvalues fehlgeschlagen !');
            return;
        }

        await this.sendAircon({command:'logout',data:{sessionID:sessionID}});
    }

    private async awmSendInformation(id: string, value: any): Promise<void> {
        let response = await this.sendAircon({command: 'login', data: {username: this.config.username, password: this.config.password}});
        let sessionID = ''
        if (response && response.success) {
            sessionID = response.data.id.sessionID;
        } else {
            this.log.error('Login fehlgeschlagen !');
        }
        const dpMeta = this.awnDpMetadata.find((t: { name: string; }) => t.name === id);
        if (dpMeta) {
            let translatedVal = value;
            if (dpMeta.type === 2) {
                translatedVal = translatedVal * 10;
            }
            response = await this.sendAircon({command:'setdatapointvalue',data:{sessionID:sessionID, uid: dpMeta.uid, value:translatedVal}})
            if (response && response.success) {
                await this.setStateAsync(id, { val: value, ack: true });
            } else {
                this.log.error('SetDataPoint fehlgeschlagen !');
            }
        }
        await this.sendAircon({command:'logout',data:{sessionID:sessionID}});
    }
}

if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Airconwithme(options);
} else {
    // otherwise start the instance directly
    (() => new Airconwithme())();
}