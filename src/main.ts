import * as utils from '@iobroker/adapter-core';
import axios, { AxiosResponse } from 'axios';

// Interfaces for better type safety
interface AirconConfig {
    ipaddress: string;
    username: string;
    password: string;
}

interface InfoMetadata {
    name: string;
    type: 'string' | 'number';
    role: string;
    caption: string;
}

interface DatapointMetadata {
    uid: number;
    name: string;
    caption: string;
    states?: string;
    type: number;
}

interface ApiResponse<T = any> {
    success: boolean;
    data: T;
    error?: string;
}

interface LoginResponse {
    id: {
        sessionID: string;
    };
}

interface InfoData {
    [key: string]: string | number;
}

interface DatapointValue {
    uid: number;
    value: number;
}

interface AvailableDatapoint {
    uid: number;
    type: number;
    rw: string;
    descr?: {
        minValue?: number;
        maxValue?: number;
    };
}

class Airconwithme extends utils.Adapter {
    private baseUrl: string = '';
    private awmInfoInterval: NodeJS.Timeout | null = null;
    private currentSessionId: string | null = null;
    private sessionExpiryTime: number = 0;
    private readonly sessionDurationMs = 5 * 60 * 1000; // 5 minutes
    private readonly requestTimeoutMs = 10000; // 10 seconds

    private readonly awmInfoMetadata: InfoMetadata[] = [
        {name: 'wlanSTAMAC', type: 'string', role: 'state', caption: 'Device Client MAC Address'},
        {name: 'wlanAPMAC', type: 'string', role: 'state', caption: 'Device Access Point MAC Address'},
        {name: 'ownSSID', type: 'string', role: 'state', caption: 'Device Access Point SSID'},
        {name: 'fwVersion', type: 'string', role: 'state', caption: 'Device Firmware Version'},
        {name: 'wlanFwVersion', type: 'string', role: 'state', caption: 'Wireless Firmware Version'},
        {name: 'acStatus', type: 'number', role: 'state', caption: 'Air Conditioner Communication Status'},
        {name: 'wlanLNK', type: 'number', role: 'state', caption: 'Connection Status with Wireless Network'},
        {name: 'ssid', type: 'string', role: 'state', caption: 'Wireless Network SSID'},
        {name: 'rssi', type: 'number', role: 'value.rssi', caption: 'Wireless Signal Strength'},
        {name: 'tcpServerLNK', type: 'number', role: 'state', caption: 'Cloud Server Connection'},
        {name: 'localdatetime', type: 'string', role: 'state', caption: 'Local Datetime'},
        {name: 'powerStatus', type: 'number', role: 'state', caption: 'Power Status'},
        {name: 'wifiTxPower', type: 'number', role: 'state', caption: 'Wifi Transfer Power'},
        {name: 'lastconfigdatetime', type: 'number', role: 'state', caption: 'Last Config Datetime'},
        {name: 'deviceModel', type: 'string', role: 'state', caption: 'Device Model'},
        {name: 'sn', type: 'string', role: 'state', caption: 'Serial number'},
        {name: 'lastError', type: 'number', role: 'state', caption: 'Last Error'}
    ];

    private readonly awnDpMetadata: DatapointMetadata[] = [
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
     * Validates the adapter configuration
     */
    private validateConfiguration(): boolean {
        const config = this.config as AirconConfig;

        if (!config.ipaddress) {
            this.log.error('No IP address configured. Please check adapter configuration.');
            return false;
        }

        if (!config.username || !config.password) {
            this.log.warn('No username/password configured. Using default credentials (admin/admin).');
            config.username = config.username || 'admin';
            config.password = config.password || 'admin';
        }

        // Validate IP address format
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ipRegex.test(config.ipaddress)) {
            this.log.error(`Invalid IP address format: ${config.ipaddress}`);
            return false;
        }

        return true;
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        try {
            if (!this.validateConfiguration()) {
                return;
            }

            this.log.info(`Connecting to air conditioner at: ${this.config.ipaddress}`);
            this.baseUrl = `http://${this.config.ipaddress}/api.cgi`;

            // Create reachability datapoint
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

            // Create informational datapoints
            for (const infoProp of this.awmInfoMetadata) {
                await this.setObjectNotExistsAsync(`info.${infoProp.name}`, {
                    type: 'state',
                    common: {
                        name: infoProp.caption,
                        type: infoProp.type,
                        role: infoProp.role,
                        read: true,
                        write: false
                    },
                    native: {},
                });
            }

            // Read initial device information and create datapoints
            await this.refreshDeviceInformation();

            // Subscribe to controllable states
            this.subscribeStates('on');
            this.subscribeStates('userMode');
            this.subscribeStates('fanSpeed');
            this.subscribeStates('position');
            this.subscribeStates('userSetpoint');
            this.subscribeStates('remoteDisable');

            // Set up periodic data refresh (60 seconds)
            this.awmInfoInterval = setInterval(async () => {
                await this.refreshDeviceInformation();
            }, 60000);

            this.log.info('Adapter initialization completed successfully');
        } catch (error) {
            this.log.error(`Failed to initialize adapter: ${error}`);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload(callback: () => void): void {
        try {
            if (this.awmInfoInterval) {
                clearInterval(this.awmInfoInterval);
                this.awmInfoInterval = null;
            }
            if (this.currentSessionId) {
                this.logout().catch(() => {/* ignore logout errors on shutdown */});
            }
            callback();
        } catch (error) {
            this.log.error(`Error during unload: ${error}`);
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     */
    private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (!state || state.ack) {
            return; // Ignore acknowledged states
        }

        try {
            const adapterId = id.replace(`${this.namespace}.`, '');

            if (!this.isValidStateId(adapterId)) {
                this.log.warn(`Received state change for unknown datapoint: ${adapterId}`);
                return;
            }

            this.log.info(`User changed state '${adapterId}' to: ${state.val}`);
            await this.sendDeviceCommand(adapterId, state.val);
        } catch (error) {
            this.log.error(`Failed to process state change for '${id}': ${error}`);
        }
    }

    /**
     * Validates if the state ID is a known controllable datapoint
     */
    private isValidStateId(stateId: string): boolean {
        const validStates = ['on', 'userMode', 'fanSpeed', 'position', 'userSetpoint', 'remoteDisable'];
        return validStates.includes(stateId);
    }

    /**
     * Gets a valid session ID, logging in if necessary
     */
    private async getValidSession(): Promise<string | null> {
        const now = Date.now();

        // Check if current session is still valid
        if (this.currentSessionId && now < this.sessionExpiryTime) {
            return this.currentSessionId;
        }

        // Need to login
        const response = await this.sendAirconCommand<LoginResponse>({
            command: 'login',
            data: {
                username: this.config.username || 'admin',
                password: this.config.password || 'admin'
            }
        });

        if (response?.success && response.data?.id?.sessionID) {
            this.currentSessionId = response.data.id.sessionID;
            this.sessionExpiryTime = now + this.sessionDurationMs;
            this.log.debug('Successfully logged in to air conditioner');
            return this.currentSessionId;
        }

        this.log.error('Login failed - invalid credentials or device not responding');
        this.currentSessionId = null;
        return null;
    }

    /**
     * Logs out from the current session
     */
    private async logout(): Promise<void> {
        if (!this.currentSessionId) {
            return;
        }

        try {
            await this.sendAirconCommand({
                command: 'logout',
                data: { sessionID: this.currentSessionId }
            });
        } catch (error) {
            this.log.debug(`Logout error (ignored): ${error}`);
        } finally {
            this.currentSessionId = null;
            this.sessionExpiryTime = 0;
        }
    }

    /**
     * Sends a command to the air conditioner API
     */
    private async sendAirconCommand<T = any>(command: object): Promise<ApiResponse<T> | null> {
        try {
            const response: AxiosResponse<ApiResponse<T>> = await axios.post(
                this.baseUrl,
                command,
                {
                    timeout: this.requestTimeoutMs,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'ioBroker.airconwithme'
                    }
                }
            );

            if (response.status !== 200) {
                this.log.error(`HTTP error: ${response.status} ${response.statusText}`);
                return null;
            }

            return response.data;
        } catch (error: any) {
            if (error.code === 'ECONNREFUSED') {
                this.log.error('Cannot connect to air conditioner. Please check IP address and network connectivity.');
            } else if (error.code === 'ETIMEDOUT') {
                this.log.error('Request timeout. Air conditioner is not responding.');
            } else {
                this.log.error(`API request failed: ${error.message}`);
            }
            return null;
        }
    }

    /**
     * Refreshes all device information and updates states
     */
    private async refreshDeviceInformation(): Promise<void> {
        try {
            const sessionID = await this.getValidSession();
            if (!sessionID) {
                await this.setStateAsync('reachable', { val: false, ack: true });
                return;
            }

            await this.setStateAsync('reachable', { val: true, ack: true });

            // Read device information
            await this.updateDeviceInfo(sessionID);

            // Setup and update datapoints
            await this.updateDatapoints(sessionID);

            // Read current values
            await this.updateDatapointValues(sessionID);

        } catch (error) {
            this.log.error(`Failed to refresh device information: ${error}`);
            await this.setStateAsync('reachable', { val: false, ack: true });
        }
    }

    /**
     * Updates device information states
     */
    private async updateDeviceInfo(sessionID: string): Promise<void> {
        const response = await this.sendAirconCommand<{info: InfoData}>({
            command: 'getinfo',
            data: { sessionID }
        });

        if (response?.success && response.data?.info) {
            const infoData = response.data.info;
            this.log.debug(`Device info: ${JSON.stringify(infoData)}`);

            for (const [key, value] of Object.entries(infoData)) {
                await this.setStateAsync(`info.${key}`, { val: value, ack: true });
            }
        } else {
            throw new Error('Failed to get device information');
        }
    }

    /**
     * Updates available datapoints and creates corresponding ioBroker objects
     */
    private async updateDatapoints(sessionID: string): Promise<void> {
        const response = await this.sendAirconCommand<{dp: {datapoints: AvailableDatapoint[]}}>({
            command: 'getavailabledatapoints',
            data: { sessionID, uid: 'all' }
        });

        if (response?.success && response.data?.dp?.datapoints) {
            const availableDatapoints = response.data.dp.datapoints;

            for (const dp of availableDatapoints) {
                const dpMeta = this.awnDpMetadata.find(meta => meta.uid === dp.uid);
                if (dpMeta) {
                    await this.createDatapointObject(dp, dpMeta);
                }
            }
        } else {
            throw new Error('Failed to get available datapoints');
        }
    }

    /**
     * Creates an ioBroker object for a datapoint
     */
    private async createDatapointObject(dp: AvailableDatapoint, meta: DatapointMetadata): Promise<void> {
        const objectDefinition: ioBroker.SettableObject = {
            type: 'state',
            common: {
                name: meta.caption,
                type: 'number',
                role: dp.type === 2 ? 'value.temperature' : 'state',
                read: dp.rw.includes('r'),
                write: dp.rw.includes('w'),
                ...(dp.type === 2 && { unit: '°C' }),
                ...(meta.states && { states: meta.states }),
                ...(dp.descr?.minValue && { min: dp.descr.minValue / 10 }),
                ...(dp.descr?.maxValue && { max: dp.descr.maxValue / 10 })
            },
            native: {}
        };

        await this.setObjectNotExistsAsync(meta.name, objectDefinition);
    }

    /**
     * Updates current datapoint values
     */
    private async updateDatapointValues(sessionID: string): Promise<void> {
        const response = await this.sendAirconCommand<{dpval: DatapointValue[]}>({
            command: 'getdatapointvalue',
            data: { sessionID, uid: 'all' }
        });

        if (response?.success && response.data?.dpval) {
            for (const dpv of response.data.dpval) {
                const meta = this.awnDpMetadata.find(m => m.uid === dpv.uid);
                if (meta) {
                    const value = meta.type === 2 ? dpv.value / 10 : dpv.value;
                    await this.setStateAsync(meta.name, { val: value, ack: true });
                }
            }
        } else {
            throw new Error('Failed to get datapoint values');
        }
    }

    /**
     * Sends a command to set a datapoint value on the device
     */
    private async sendDeviceCommand(stateId: string, value: any): Promise<void> {
        try {
            const sessionID = await this.getValidSession();
            if (!sessionID) {
                throw new Error('Unable to get valid session');
            }

            const dpMeta = this.awnDpMetadata.find(meta => meta.name === stateId);
            if (!dpMeta) {
                throw new Error(`Unknown datapoint: ${stateId}`);
            }

            // Validate and transform value
            const transformedValue = this.validateAndTransformValue(dpMeta, value);
            if (transformedValue === null) {
                throw new Error(`Invalid value for ${stateId}: ${value}`);
            }

            const response = await this.sendAirconCommand({
                command: 'setdatapointvalue',
                data: {
                    sessionID,
                    uid: dpMeta.uid,
                    value: transformedValue
                }
            });

            if (response?.success) {
                await this.setStateAsync(stateId, { val: value, ack: true });
                this.log.info(`Successfully set ${stateId} to ${value}`);
            } else {
                throw new Error(`Device rejected command for ${stateId}`);
            }

        } catch (error) {
            this.log.error(`Failed to set ${stateId} to ${value}: ${error}`);
            throw error;
        }
    }

    /**
     * Validates and transforms a value for sending to the device
     */
    private validateAndTransformValue(meta: DatapointMetadata, value: any): number | null {
        if (value === null || value === undefined) {
            return null;
        }

        const numValue = Number(value);
        if (isNaN(numValue)) {
            return null;
        }

        // Transform temperature values (multiply by 10 for device)
        return meta.type === 2 ? Math.round(numValue * 10) : Math.round(numValue);
    }
}

if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Airconwithme(options);
} else {
    // otherwise start the instance directly
    (() => new Airconwithme())();
}
