/*
 * Project: ESP-IDF VSCode Extension
 * File Created: Wednesday, 31st July 2019 2:59:47 pm
 * Copyright 2019 Espressif Systems (Shanghai) CO LTD
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *    http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { EventEmitter } from "events";
import { Socket } from "net";

export class TCLClient extends EventEmitter {
    private static readonly DELIMITER = "\x1a";

    private readonly host: string;
    private readonly port: number;
    private readonly isMultipleCommandEnabled: boolean;
    private isRunning: boolean;
    private sock: Socket;

    constructor(openOCDHost: string, openOCDPort: number, multipleCommandEnabled: boolean = false) {
        super();
        this.host = openOCDHost;
        this.port = openOCDPort;
        this.sock = new Socket();
        this.isMultipleCommandEnabled = multipleCommandEnabled;
    }

    public async isOpenOCDServerRunning(): Promise<boolean> {
        return new Promise<boolean>((resolve, _) => {
            const sock = new Socket();
            sock.connect(this.port, this.host, () => {
                sock.destroy();
                resolve(true);
            });
            sock.on("error", (error) => {
                sock.destroy();
                resolve(false);
            });
        });
    }

    public sendCommandWithCapture(command: string) {
        return this.sendCommand(`capture "${command}"`);
    }

    public sendCommand(command: string) {
        if (this.isMultipleCommandEnabled) {
            return this.sendMultipleCommandOnSameConnection(command);
        }
        if (this.isRunning) {
            throw new Error("Only once command can be send per session, stop to send more");
        }
        this.sock = new Socket();
        this.isRunning = true;
        let flushBuffer = Buffer.alloc(0);
        this.sock.connect(this.port, this.host, () => {
            this.emit("connect");
            this.sock.write(`${command}${TCLClient.DELIMITER}`);

            this.sock.on("data", (data) => {
                flushBuffer = Buffer.concat([flushBuffer, data]);
                if (data.includes(TCLClient.DELIMITER)) {
                    this.emit("response", flushBuffer);
                    flushBuffer = Buffer.alloc(0);
                }
            });

            this.sock.on("error", (error) => {
                this.emit("error", error);
            });
        });
    }

    public stop() {
        if (this.isRunning && !this.sock.destroyed) {
            this.sock.destroy();
            this.sock = new Socket();
            this.sock.removeAllListeners();
        }
    }

    private sendMultipleCommandOnSameConnection(command) {
        let flushBuffer = Buffer.alloc(0);

        if (!this.isRunning || this.sock.destroyed) {
            this.sock = new Socket();
            this.sock.connect(this.port, this.host, () => {
                this.emit("connect");
                this.isRunning = true;
                this.sock.write(`${command}${TCLClient.DELIMITER}`);
            });
        } else {
            this.sock.write(`${command}${TCLClient.DELIMITER}`);
        }

        this.sock.on("data", (data) => {
            flushBuffer = Buffer.concat([flushBuffer, data]);
            if (data.includes(TCLClient.DELIMITER)) {
                this.emit("response", flushBuffer);
                flushBuffer = Buffer.alloc(0);
            }
        });
        this.sock.on("error", (error) => {
            this.emit("error", error);
        });
    }
}
