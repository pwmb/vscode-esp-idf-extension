/*
 * Project: ESP-IDF VSCode Extension
 * File Created: Thursday, 8th August 2019 6:41:01 pm
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
import * as vscode from "vscode";

import { mkdirSync } from "fs";
import { join } from "path";
import { Logger } from "../../logger/logger";
import { fileExists, sleep } from "../../utils";
import { OpenOCDManager } from "../openOcd/openOcdManager";
import { TCLClient, TCLConnection } from "../openOcd/tcl/tclClient";
import { AppTraceArchiveTreeDataProvider } from "./tree/appTraceArchiveTreeDataProvider";
import { AppTraceButtonType, AppTraceTreeDataProvider } from "./tree/appTraceTreeDataProvider";

export class HeapTraceManager extends EventEmitter {
    private treeDataProvider: AppTraceTreeDataProvider;
    private archiveDataProvider: AppTraceArchiveTreeDataProvider;
    private heapTraceNotificationTCLClientHandler: TCLClient;
    private heapTraceCommandChainTCLClientHandler: TCLClient;
    private heapTraceChannel: vscode.OutputChannel;

    constructor(treeDataProvider: AppTraceTreeDataProvider, archiveDataProvider: AppTraceArchiveTreeDataProvider) {
        super();
        this.treeDataProvider = treeDataProvider;
        this.archiveDataProvider = archiveDataProvider;
        const tclConnectionParams = { host: "localhost", port: 6666 };
        this.heapTraceNotificationTCLClientHandler = new TCLClient(tclConnectionParams);
        this.heapTraceCommandChainTCLClientHandler = new TCLClient(tclConnectionParams);
        this.heapTraceChannel = vscode.window.createOutputChannel("Heap Trace");
    }

    public async start() {
        try {
            if (await OpenOCDManager.init().promptUserToLaunchOpenOCDServer()) {
                this.heapTraceChannel.clear();
                this.heapTraceChannel.show(true);
                this.showStopButton();
                const workspace = vscode.workspace.workspaceFolders ?
                vscode.workspace.workspaceFolders[0].uri.path : "";
                if (!fileExists(join(workspace, "trace"))) {
                    mkdirSync(join(workspace, "trace"));
                }
                const fileName = `file://${join(workspace, "trace")}/htrace_${new Date().getTime()}.svdat`;
                const commandChain = new CommandChain();
                commandChain
                    .buildCommand("reset halt")
                    .buildCommand("bp 0x400d35b4 4 hw")
                    .buildCommand("bp 0x400d35d0 4 hw")
                    .buildCommand("resume")
                    .buildCommand("rbp 0x400d35b4")
                    .buildCommand(`esp32 sysview start ${fileName}`)
                    .buildCommand("resume")
                    .buildCommand("rbp 0x400d35d0")
                    .buildCommand("esp32 sysview stop");
                this.heapTraceNotificationTCLClientHandler.on("response", (resp: Buffer) => {
                    this.heapTraceChannel.appendLine("->> " + resp);
                });
                this.heapTraceNotificationTCLClientHandler.sendCommandWithCapture("tcl_notifications on");

                this.heapTraceCommandChainTCLClientHandler.on("response", async (resp: Buffer) => {
                    this.heapTraceChannel.appendLine(">> " + resp);
                    const cmd = commandChain.next();
                    if (!cmd) {
                        this.heapTraceNotificationTCLClientHandler.stop();
                        this.heapTraceCommandChainTCLClientHandler.stop();
                        this.archiveDataProvider.populateArchiveTree();
                        this.showStartButton();
                        return;
                    }
                    await sleep(5000);
                    this.heapTraceCommandChainTCLClientHandler.sendCommandWithCapture(cmd);
                });
                await sleep(1000);
                this.heapTraceCommandChainTCLClientHandler.sendCommandWithCapture(commandChain.next());
            }
        } catch (error) {
            Logger.errorNotify(error.message, error);
        }
    }

    public async stop() {
        try {
            if (await OpenOCDManager.init().promptUserToLaunchOpenOCDServer()) {
                this.showStartButton();
                this.heapTraceNotificationTCLClientHandler.stop();
                this.heapTraceCommandChainTCLClientHandler.stop();
            }
        } catch (error) {
            Logger.errorNotify(error.message, error);
        }
    }

    private showStopButton() {
        this.treeDataProvider.showStopButton(AppTraceButtonType.HeapTraceButton);
    }
    private showStartButton() {
        this.treeDataProvider.showStartButton(AppTraceButtonType.HeapTraceButton);
    }
}

// tslint:disable-next-line: max-classes-per-file
class CommandChain {
    private chain: string[];
    constructor() {
        this.chain = new Array<string>();
    }

    public buildCommand(command: string): CommandChain {
        this.chain.push(command);
        return this;
    }

    public next(): string {
        return this.chain.shift();
    }
}
