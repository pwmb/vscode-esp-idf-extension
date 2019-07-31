/*
 * Project: ESP-IDF VSCode Extension
 * File Created: Monday, 8th July 2019 11:18:25 am
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
import { mkdirSync } from "fs";
import { join } from "path";
import * as vscode from "vscode";
import * as idfConf from "../../idfConfiguration";
import { Logger } from "../../logger/logger";
import { fileExists } from "../../utils";
import { TCLClient } from "../openOcd/tcl/tclClient";
import { AppTraceArchiveTreeDataProvider } from "./tree/appTraceArchiveTreeDataProvider";
import { AppTraceTreeDataProvider } from "./tree/appTraceTreeDataProvider";

export interface IAppTraceManagerConfig {
    host: string;
    port: number;
    timeout?: number;
    shellPrompt?: string;
}

export class AppTraceManager extends EventEmitter {

    public static async saveConfiguration(workspaceRoot: vscode.Uri) {
        await this.promptUserForEditingApptraceConfig(
            "Data polling period for apptrace",
            "milliseconds",
            "trace.poll_period",
            workspaceRoot,
            (value: string): string => {
                if (value.match(/^[0-9]*$/g)) {
                    return "";
                }
                return "Invalid poll_period value, please enter only number";
            },
        );
        await this.promptUserForEditingApptraceConfig(
            "Maximum size of data to be collected",
            "bytes",
            "trace.trace_size",
            workspaceRoot,
            (value: string): string => {
                if (value.match(/^(?:-1|[0-9]*)$/g)) {
                    return "";
                }
                return "Invalid trace_size value, only -1 or positive integer allowed";
            },
        );
        await this.promptUserForEditingApptraceConfig(
            "Idle timeout for apptrace",
            "seconds",
            "trace.stop_tmo",
            workspaceRoot,
            (value: string): string => {
                if (value.match(/^[0-9]*$/g)) {
                    return "";
                }
                return "Invalid stop_tmo value, please enter only number";
            },
        );
        await this.promptUserForEditingApptraceConfig(
            "Should wait for halt?",
            "0 = Starts Immediately; else wait",
            "trace.wait4halt",
            workspaceRoot,
            (value: string): string => {
                if (value.match(/^[0-9]*$/g)) {
                    return "";
                }
                return "Invalid wait4halt value, please enter only number";
            },
        );
        await this.promptUserForEditingApptraceConfig(
            "Number of bytes to skip at the start",
            "bytes",
            "trace.skip_size",
            workspaceRoot,
            (value: string): string => {
                if (value.match(/^[0-9]*$/g)) {
                    return "";
                }
                return "Invalid skip_size value, please enter only number";
            },
        );
    }

    private static async promptUserForEditingApptraceConfig(
        prompt: string,
        placeholder: string,
        paramName: string,
        workspaceRoot: vscode.Uri,
        validatorFunction: (value: string) => string,
    ) {
        const savedConf = idfConf.readParameter(paramName, workspaceRoot);
        const userInput = await vscode.window.showInputBox({
            placeHolder: placeholder,
            value: savedConf,
            prompt,
            ignoreFocusOut: true,
            validateInput: validatorFunction,
        });
        if (userInput) {
            idfConf.writeParameter(paramName, userInput, workspaceRoot);
        }
    }

    private treeDataProvider: AppTraceTreeDataProvider;
    private archiveDataProvider: AppTraceArchiveTreeDataProvider;

    constructor(treeDataProvider: AppTraceTreeDataProvider, archiveDataProvider: AppTraceArchiveTreeDataProvider) {
        super();
        this.treeDataProvider = treeDataProvider;
        this.archiveDataProvider = archiveDataProvider;
    }

    public async start() {
        try {
            if (await this.promptUserToLaunchOpenOCDServer()) {
                this.treeDataProvider.showStopButton();
                this.treeDataProvider.updateDescription("");
                // tslint:disable-next-line: max-line-length
                const workspace = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : undefined;
                const workspacePath = workspace ? workspace.path : "";
                const fileName = `file://${join(workspacePath, "trace")}/trace_${new Date().getTime()}.trace`;
                const pollPeriod = idfConf.readParameter("trace.poll_period", workspace);
                const traceSize = idfConf.readParameter("trace.trace_size", workspace);
                const stopTmo = idfConf.readParameter("trace.stop_tmo", workspace);
                const wait4halt = idfConf.readParameter("trace.wait4halt", workspace);
                const skipSize = idfConf.readParameter("trace.skip_size", workspace);
                const startTracing = this.sendCommandToTCLSession(
                    ["esp32", "apptrace", "start", fileName, pollPeriod, traceSize, stopTmo, wait4halt, skipSize]
                        .join(" "),
                );
                const statusChecker = this.appTracingStatusChecker(() => {
                    clearInterval(statusChecker);

                    this.treeDataProvider.showStartButton();
                    this.treeDataProvider.updateDescription("[Stopped]");
                    this.archiveDataProvider.populateArchiveTree();

                    startTracing.stop();
                });
            }
        } catch (error) {
            Logger.errorNotify(error.message, error);
        }
    }

    public async stop() {
        if (await this.promptUserToLaunchOpenOCDServer()) {
            const stopHandler = this.sendCommandToTCLSession("esp32 apptrace stop");
            stopHandler.on("response", (resp: Buffer) => {
                const respStr = resp.toString();
                if (respStr.includes("Tracing is not running!")) {
                    stopHandler.stop();
                    this.treeDataProvider.showStartButton();
                    this.treeDataProvider.updateDescription("[NotRunning]");
                }
            });
        } else {
            this.treeDataProvider.showStartButton();
            this.treeDataProvider.updateDescription("[Terminated]");
        }
    }

    private async promptUserToLaunchOpenOCDServer() {
        const tclClient = new TCLClient("localhost", 6666);
        if (!await tclClient.isOpenOCDServerRunning()) {
            Logger.warnNotify("Launch OpenOCD Server before starting app trace");
            return false;
        }
        return true;
    }

    private sendCommandToTCLSession(command: string): TCLClient {
        const workspace = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.path : "";
        if (!fileExists(join(workspace, "trace"))) {
            mkdirSync(join(workspace, "trace"));
        }
        const startTracingCommandHandler = new TCLClient("localhost", 6666);
        startTracingCommandHandler.sendCommandWithCapture(command);
        return startTracingCommandHandler;
    }
    private appTracingStatusChecker(onStop: () => void): NodeJS.Timer {
        const tclClient = new TCLClient("localhost", 6666, true);
        tclClient.on("response", (resp: Buffer) => {
            const respStr = resp.toString();
            if (respStr.includes("Tracing is STOPPED")) {
                tclClient.stop();
                onStop();
            } else {
                const matchArr = respStr.match(/[0-9]* of [0-9]*/gm);
                if (matchArr && matchArr.length > 0) {
                    const progressArr = matchArr[0].split(" of ");
                    try {
                        const progressPercentage = (parseInt(progressArr[0], 10) / parseInt(progressArr[1], 10)) * 100;
                        this.treeDataProvider.updateDescription(`${Math.round(progressPercentage)}%`);
                    } catch (error) {
                        this.treeDataProvider.updateDescription(`Tracing...`);
                    }
                }
            }
        });

        tclClient.on("error", (error: Error) => {
            Logger.error(`Some error prevailed while checking the tracking status`, error);
            tclClient.stop();
            onStop();
        });

        const tracingStatus = setInterval(() => {
            tclClient.sendCommandWithCapture("esp32 apptrace status");
        }, 5000);
        return tracingStatus;
    }
}
