/*
 * Project: ESP-IDF VSCode Extension
 * File Created: Thursday, 22nd August 2019 6:11:02 pm
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
import { join } from "path";
import * as vscode from "vscode";

import * as idfConf from "../../../../idfConfiguration";
import { canAccessFile, spawn } from "../../../../utils";

export abstract class XtensaTools {

    protected readonly workspaceRoot: vscode.Uri;
    protected readonly toolName: string;
    protected readonly toolsBinPath: string;

    constructor(workspaceRoot: vscode.Uri, toolName: string, toolsBinPath?: string) {
        this.workspaceRoot = workspaceRoot;
        this.toolName = toolName;
        this.toolsBinPath = toolsBinPath || this.xtensaToolsBinPath();
    }

    protected async call(args: string[]): Promise<Buffer> {
        this.preCheck();
        return await spawn(this.toolName, args, {
            cwd: this.toolsBinPath,
        });
    }

    private preCheck() {
        if (!canAccessFile(join(this.toolsBinPath, this.toolName))) {
            throw new Error(`${this.toolName} not exists or not accessible at ${this.toolsBinPath}`);
        }
    }

    private xtensaToolsBinPath(): string {
        const idfPathDir = idfConf.readParameter("idf.xtensaEsp32Path", this.workspaceRoot);
        return join(idfPathDir, "bin");
    }
}